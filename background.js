let cachedSettings = {
    mode: 'active',
    isExtensionEnabled: true,
    isAllMuted: false,
    rememberLastTab: false,
    firstAudibleTabId: null,
    whitelistedTabId: null,
    muteNewInitialTabIds: []
};

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
};

const isManageableTab = (tab) => tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('edge://');

const safeGetTab = (tabId) => chrome.tabs.get(tabId).catch(() => null);

const safeUpdateTab = (tabId, options) => {
    return chrome.tabs.update(tabId, options).catch(e => {
        const msg = e.message || '';
        if (!msg.includes('No tab with id') && !msg.includes('tabs.Tab')) {
            console.warn(`Could not update tab ${tabId}:`, msg);
        }
    });
};

const safeQueryTabs = (options) => chrome.tabs.query(options).catch(() => []);

const refreshCache = async () => {
    const [syncSettings, sessionSettings] = await Promise.all([
        chrome.storage.sync.get({
            mode: 'active',
            isExtensionEnabled: true,
            isAllMuted: false,
            rememberLastTab: false
        }),
        chrome.storage.session.get({
            firstAudibleTabId: null,
            whitelistedTabId: null,
            muteNewInitialTabIds: []
        })
    ]);
    cachedSettings = {...syncSettings, ...sessionSettings};
    return cachedSettings;
};

const setMuteStatusForTabs = (tabs, mute) => {
    return Promise.all(
        tabs.filter(tab => tab.mutedInfo?.muted !== mute)
            .map(tab => safeUpdateTab(tab.id, {muted: mute}))
    );
};

const getUnmuteTargetId = async (settings, activeTabId) => {
    if (settings.mode === 'active') {
        if (activeTabId) return activeTabId;
        const [activeTab] = await safeQueryTabs({active: true, currentWindow: true});
        return activeTab?.id || null;
    }
    
    const targetId = settings.mode === 'first-sound' 
        ? settings.firstAudibleTabId 
        : settings.whitelistedTabId;
    
    if (!targetId) return null;
    
    const targetTab = await safeGetTab(targetId);
    return targetTab ? targetId : null;
};

const applyMutingRules = async (settings, activeTabId = null) => {
    const currentSettings = settings || cachedSettings;
    
    const allTabs = await safeQueryTabs({});
    const manageableTabs = allTabs.filter(isManageableTab);
    
    if (!currentSettings.isExtensionEnabled) {
        return setMuteStatusForTabs(manageableTabs, false);
    }
    
    if (currentSettings.isAllMuted) {
        return setMuteStatusForTabs(manageableTabs, true);
    }
    
    if (currentSettings.mode === 'mute-new') return;
    
    const tabToUnmuteId = await getUnmuteTargetId(currentSettings, activeTabId);
    const unmutedTabs = allTabs.filter(tab => !tab.mutedInfo?.muted && isManageableTab(tab));
    const tabsToMute = unmutedTabs.filter(tab => tab.id !== tabToUnmuteId);
    
    const mutePromises = tabsToMute.map(tab => safeUpdateTab(tab.id, {muted: true}));
    
    if (tabToUnmuteId) {
        const targetTab = await safeGetTab(tabToUnmuteId);
        if (targetTab?.mutedInfo?.muted) {
            mutePromises.push(safeUpdateTab(tabToUnmuteId, {muted: false}));
        }
    }
    
    return Promise.all(mutePromises);
};

const debouncedApplyMutingRules = debounce(async () => {
    await refreshCache(); 
    await applyMutingRules(cachedSettings);
}, 150);

const ICON_PATHS = {
    default: {16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png'},
    off: {16: 'icons/icon16_off.png', 48: 'icons/icon48_off.png', 128: 'icons/icon128_off.png'},
    mute: {16: 'icons/icon16_mute.png', 48: 'icons/icon48_mute.png', 128: 'icons/icon128_mute.png'}
};

const updateExtensionIcon = (settings) => {
    const iconSetKey = !settings.isExtensionEnabled ? 'off' : settings.isAllMuted ? 'mute' : 'default';
    chrome.action.setIcon({path: ICON_PATHS[iconSetKey]});
};

const formatTabForPopup = (tab) => ({
    id: tab.id,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    audible: tab.audible,
    url: tab.url
});

const updatePopupData = async () => {
    const allTabs = await safeQueryTabs({});
    const popupTabsData = allTabs.filter(isManageableTab).map(formatTabForPopup);
    chrome.storage.session.set({popupTabsData}).catch(e => console.warn("Error setting popup data:", e.message));
};

const debouncedUpdatePopupData = debounce(updatePopupData, 150);

const handleAudibleChange = async (tabId, settings) => {
    if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        const [activeTab] = await safeQueryTabs({active: true, currentWindow: true});
        if (activeTab?.id === tabId) {
            await chrome.storage.session.set({firstAudibleTabId: tabId});
            cachedSettings.firstAudibleTabId = tabId;
            return;
        }
    }
    
    const tabToUnmuteId = await getUnmuteTargetId(settings, null);
    if (tabId !== tabToUnmuteId) {
        safeUpdateTab(tabId, {muted: true});
    }
    debouncedApplyMutingRules();
};

const handleModeChange = async (newMode) => {
    if (newMode === 'mute-new') {
        const manageableTabs = (await safeQueryTabs({})).filter(isManageableTab);
        await chrome.storage.session.set({muteNewInitialTabIds: manageableTabs.map(tab => tab.id)});
        return setMuteStatusForTabs(manageableTabs, false);
    }
    
    if (newMode === 'first-sound') {
        const {firstAudibleTabId} = await chrome.storage.session.get('firstAudibleTabId');
        const tab = firstAudibleTabId ? await safeGetTab(firstAudibleTabId) : null;
        
        if (!tab) {
            await chrome.storage.session.remove('firstAudibleTabId');
            cachedSettings.firstAudibleTabId = null;
            const [activeTab] = await safeQueryTabs({active: true, currentWindow: true});
            if (activeTab?.audible) {
                await chrome.storage.session.set({firstAudibleTabId: activeTab.id});
                cachedSettings.firstAudibleTabId = activeTab.id;
            }
        }
        return;
    }
    
    if (newMode === 'whitelist') {
        const {whitelistedTabId} = await chrome.storage.session.get('whitelistedTabId');
        const tab = whitelistedTabId ? await safeGetTab(whitelistedTabId) : null;
        if (!tab) {
            await chrome.storage.session.remove('whitelistedTabId');
            cachedSettings.whitelistedTabId = null;
        }
    }
};

const handleSourceTabIdChange = ({oldValue, newValue}, isAllMuted) => {
    if (oldValue) safeUpdateTab(oldValue, {muted: true});
    if (newValue && !isAllMuted) safeUpdateTab(newValue, {muted: false});
};

const handleMuteAllChange = async ({newValue: isAllMuted}, settings) => {
    if (isAllMuted === false && settings.mode === 'mute-new') {
        const {muteNewInitialTabIds = []} = await chrome.storage.session.get('muteNewInitialTabIds');
        const currentlyMutedTabs = await safeQueryTabs({muted: true});
        const tabsToUnmute = currentlyMutedTabs.filter(tab => muteNewInitialTabIds.includes(tab.id));
        return setMuteStatusForTabs(tabsToUnmute, false);
    }
    return applyMutingRules(settings);
};

const handleTabCreation = (tab) => {
    
    if (cachedSettings.isExtensionEnabled) {
        const isExplicitlySystem = tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'));
        
        if (!isExplicitlySystem) {
            let shouldMute = false;

            if (cachedSettings.isAllMuted) {
                shouldMute = true;
            } else if (cachedSettings.mode === 'active') {
                shouldMute = !tab.active;
            } 
            else if (cachedSettings.mode === 'first-sound' || cachedSettings.mode === 'whitelist') {
                 shouldMute = true;
            }

            if (shouldMute) {
                chrome.tabs.update(tab.id, {muted: true}).catch(() => {});
            }
        }
    }
    
    debouncedUpdatePopupData();
};

const handleTabActivation = async ({tabId, windowId}) => {
    await refreshCache();
    
    if (!cachedSettings.isExtensionEnabled || cachedSettings.isAllMuted) return;
    
    if (cachedSettings.mode === 'active') {
        const manageableTabsInWindow = (await safeQueryTabs({windowId})).filter(isManageableTab);
        
        safeUpdateTab(tabId, {muted: false});
        
        const promises = manageableTabsInWindow
            .filter(tab => tab.id !== tabId && !tab.mutedInfo?.muted)
            .map(tab => safeUpdateTab(tab.id, {muted: true}));
            
        return Promise.all(promises);
    }
    
    if (cachedSettings.mode === 'first-sound' && !cachedSettings.firstAudibleTabId) {
        const activatedTab = await safeGetTab(tabId);
        if (activatedTab?.audible) {
            await chrome.storage.session.set({firstAudibleTabId: activatedTab.id});
        }
    }
};

const handleTabUpdate = async (tabId, changeInfo) => {
    if ('audible' in changeInfo || 'title' in changeInfo || 'favIconUrl' in changeInfo) {
        debouncedUpdatePopupData();
    }
    
    if (changeInfo.audible === true) {
        if (cachedSettings.isExtensionEnabled && !cachedSettings.isAllMuted) {
            await handleAudibleChange(tabId, cachedSettings);
        }
    }
};

const handleTabRemoval = async (tabId) => {
    debouncedUpdatePopupData();
    
    if (!cachedSettings.isExtensionEnabled) return;
    
    const keyToUpdate = cachedSettings.mode === 'first-sound' ? 'firstAudibleTabId' 
        : cachedSettings.mode === 'whitelist' ? 'whitelistedTabId' : null;
    
    if (!keyToUpdate || tabId !== cachedSettings[keyToUpdate]) return;
    
    // Вкладка-источник закрыта - очищаем её ID
    await chrome.storage.session.remove(keyToUpdate);
    cachedSettings[keyToUpdate] = null;
    
    // Пытаемся найти замену только если включена опция "Remember Last Source"
    if (cachedSettings.rememberLastTab) {
        const audibleTabs = (await safeQueryTabs({audible: true}))
            .filter(t => t.id !== tabId && isManageableTab(t));
        
        if (audibleTabs.length > 0) {
            await chrome.storage.session.set({[keyToUpdate]: audibleTabs[0].id});
            cachedSettings[keyToUpdate] = audibleTabs[0].id;
            return;
        }
    }
    
    // Для режима First Sound: если нет замены и есть активная вкладка со звуком
    if (cachedSettings.mode === 'first-sound' && !cachedSettings.rememberLastTab) {
        const [activeTab] = await safeQueryTabs({active: true, currentWindow: true});
        if (activeTab?.audible && isManageableTab(activeTab)) {
            await chrome.storage.session.set({firstAudibleTabId: activeTab.id});
            cachedSettings.firstAudibleTabId = activeTab.id;
        }
    }
};

const handleStorageChange = async (changes, area) => {
    await refreshCache();

    if (area !== 'sync') {
        const sourceChange = changes.firstAudibleTabId || changes.whitelistedTabId;
        if (sourceChange) {
            handleSourceTabIdChange(sourceChange, cachedSettings.isAllMuted);
        }
        return;
    }
    
    let needsMutingRuleUpdate = false;
    
    if (changes.mode) {
        await handleModeChange(changes.mode.newValue);
        needsMutingRuleUpdate = true;
    }
    
    if (changes.isExtensionEnabled) {
        needsMutingRuleUpdate = true;
    }
    
    if (changes.isAllMuted) {
        await handleMuteAllChange(changes.isAllMuted, cachedSettings);
    } else if (needsMutingRuleUpdate) {
        await applyMutingRules(cachedSettings);
    }
    
    if (changes.isExtensionEnabled || changes.isAllMuted) {
        updateExtensionIcon(cachedSettings);
    }
};

const handleCommand = async (command) => {
    const settings = await refreshCache();
    
    const commandActions = {
        'toggle-extension': () => chrome.storage.sync.set({isExtensionEnabled: !settings.isExtensionEnabled}),
        'toggle-mute-all': () => chrome.storage.sync.set({isAllMuted: !settings.isAllMuted}),
        'set-current-tab-source': async () => {
            if (settings.mode === 'first-sound') {
                const [activeTab] = await safeQueryTabs({active: true, currentWindow: true});
                if (activeTab && isManageableTab(activeTab)) {
                    chrome.storage.session.set({firstAudibleTabId: activeTab.id});
                }
            }
        }
    };
    
    const action = commandActions[command];
    if (action) await action();
};

const handleRuntimeMessage = (message, sender, sendResponse) => {
    if (message.action === 'resetMuteNew') {
        (async () => {
            const manageableTabs = (await safeQueryTabs({})).filter(isManageableTab);
            await chrome.storage.session.set({muteNewInitialTabIds: manageableTabs.map(tab => tab.id)});
            await setMuteStatusForTabs(manageableTabs, false);
            sendResponse({success: true});
        })();
        return true;
    }
    return false;
};

const handleInstall = async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.sync.set({
            mode: 'active',
            isExtensionEnabled: true,
            isAllMuted: false,
            rememberLastTab: false
        });
        await chrome.storage.session.set({
            firstAudibleTabId: null,
            whitelistedTabId: null,
            muteNewInitialTabIds: []
        });
    }
    debouncedUpdatePopupData();
    await refreshCache();
};

const handleStartup = async () => {
    const {defaultMode, defaultMuteAll} = await chrome.storage.sync.get({
        defaultMode: null,
        defaultMuteAll: false
    });
    
    const updates = {};
    if (defaultMuteAll) updates.isAllMuted = true;
    if (defaultMode) updates.mode = defaultMode;
    
    if (Object.keys(updates).length > 0) {
        await chrome.storage.sync.set(updates);
    }
    
    const settings = await refreshCache();
    await Promise.all([
        applyMutingRules(settings),
        updateExtensionIcon(settings)
    ]);
};

chrome.runtime.onInstalled.addListener(handleInstall);
chrome.runtime.onStartup.addListener(handleStartup);
chrome.tabs.onCreated.addListener(handleTabCreation);
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.commands.onCommand.addListener(handleCommand);
chrome.runtime.onMessage.addListener(handleRuntimeMessage);

(async () => {
    const settings = await refreshCache();
    await Promise.all([
        applyMutingRules(settings),
        updateExtensionIcon(settings),
        updatePopupData()
    ]);
})();