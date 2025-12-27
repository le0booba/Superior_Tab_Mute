const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
};

const isManageableTab = (tab) => tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://');

const safeGetTab = (tabId) => chrome.tabs.get(tabId).catch(() => null);

const safeUpdateTab = (tabId, options) => {
    return chrome.tabs.update(tabId, options).catch(e => {
        if (!e.message.includes('No tab with id') && !e.message.includes('tabs.Tab')) {
            console.warn(`Could not update tab ${tabId}:`, e.message);
        }
    });
};

const safeQueryTabs = (options) => chrome.tabs.query(options).catch(() => []);

const getCombinedSettings = () => Promise.all([
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
]).then(([syncSettings, sessionSettings]) => ({...syncSettings, ...sessionSettings}));

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
    const allTabs = await safeQueryTabs({});
    const manageableTabs = allTabs.filter(isManageableTab);
    
    if (!settings.isExtensionEnabled) {
        return setMuteStatusForTabs(manageableTabs, false);
    }
    
    if (settings.isAllMuted) {
        return setMuteStatusForTabs(manageableTabs, true);
    }
    
    if (settings.mode === 'mute-new') return;
    
    const tabToUnmuteId = await getUnmuteTargetId(settings, activeTabId);
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
    const settings = await getCombinedSettings();
    await applyMutingRules(settings);
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
            const [activeTab] = await safeQueryTabs({active: true, currentWindow: true});
            if (activeTab?.audible) {
                await chrome.storage.session.set({firstAudibleTabId: activeTab.id});
            }
        }
        return;
    }
    
    if (newMode === 'whitelist') {
        const {whitelistedTabId} = await chrome.storage.session.get('whitelistedTabId');
        const tab = whitelistedTabId ? await safeGetTab(whitelistedTabId) : null;
        if (!tab) await chrome.storage.session.remove('whitelistedTabId');
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

const handleInstall = (details) => {
    if (details.reason === 'install') {
        chrome.storage.sync.set({
            mode: 'active',
            isExtensionEnabled: true,
            isAllMuted: false,
            rememberLastTab: false
        });
        chrome.storage.session.set({
            firstAudibleTabId: null,
            whitelistedTabId: null,
            muteNewInitialTabIds: []
        });
    }
    debouncedUpdatePopupData();
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
    
    const settings = await getCombinedSettings();
    await Promise.all([
        applyMutingRules(settings),
        updateExtensionIcon(settings)
    ]);
};

const handleTabCreation = async (tab) => {
    const settings = await getCombinedSettings();
    
    if (settings.isExtensionEnabled && isManageableTab(tab)) {
        const shouldMute = settings.isAllMuted || settings.mode !== 'active' || !tab.active;
        if (shouldMute) safeUpdateTab(tab.id, {muted: true});
    }
    
    debouncedUpdatePopupData();
};

const handleTabActivation = async ({tabId, windowId}) => {
    const settings = await getCombinedSettings();
    
    if (!settings.isExtensionEnabled || settings.isAllMuted) return;
    
    if (settings.mode === 'active') {
        const manageableTabsInWindow = (await safeQueryTabs({windowId})).filter(isManageableTab);
        const updatePromises = manageableTabsInWindow
            .filter(tab => tab.mutedInfo?.muted !== (tab.id !== tabId))
            .map(tab => safeUpdateTab(tab.id, {muted: tab.id !== tabId}));
        
        return Promise.all(updatePromises);
    }
    
    if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
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
        const settings = await getCombinedSettings();
        if (settings.isExtensionEnabled && !settings.isAllMuted) {
            await handleAudibleChange(tabId, settings);
        }
    }
};

const handleTabRemoval = async (tabId) => {
    debouncedUpdatePopupData();
    
    const settings = await getCombinedSettings();
    if (!settings.isExtensionEnabled) return;
    
    const keyToUpdate = settings.mode === 'first-sound' ? 'firstAudibleTabId' 
        : settings.mode === 'whitelist' ? 'whitelistedTabId' : null;
    
    if (!keyToUpdate || tabId !== settings[keyToUpdate]) return;
    
    if (settings.rememberLastTab) {
        const audibleTabs = (await safeQueryTabs({audible: true})).filter(t => t.id !== tabId);
        if (audibleTabs.length > 0) {
            return chrome.storage.session.set({[keyToUpdate]: audibleTabs[0].id});
        }
    }
    
    if (settings.mode === 'first-sound') {
        const [activeTab] = await safeQueryTabs({active: true, currentWindow: true});
        if (activeTab?.audible) {
            return chrome.storage.session.set({firstAudibleTabId: activeTab.id});
        }
    }
    
    await chrome.storage.session.remove(keyToUpdate);
};

const handleStorageChange = async (changes, area) => {
    if (area !== 'sync') {
        const sourceChange = changes.firstAudibleTabId || changes.whitelistedTabId;
        if (sourceChange) {
            const {isAllMuted} = await chrome.storage.sync.get('isAllMuted');
            handleSourceTabIdChange(sourceChange, isAllMuted);
        }
        return;
    }
    
    const settings = await getCombinedSettings();
    let needsMutingRuleUpdate = false;
    
    if (changes.mode) {
        await handleModeChange(changes.mode.newValue);
        needsMutingRuleUpdate = true;
    }
    
    if (changes.isExtensionEnabled) {
        needsMutingRuleUpdate = true;
    }
    
    if (changes.isAllMuted) {
        await handleMuteAllChange(changes.isAllMuted, settings);
    } else if (needsMutingRuleUpdate) {
        await applyMutingRules(settings);
    }
    
    if (changes.isExtensionEnabled || changes.isAllMuted) {
        updateExtensionIcon(settings);
    }
};

const handleCommand = async (command) => {
    const settings = await getCombinedSettings();
    
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
    const settings = await getCombinedSettings();
    await Promise.all([
        applyMutingRules(settings),
        updateExtensionIcon(settings),
        updatePopupData()
    ]);
})();