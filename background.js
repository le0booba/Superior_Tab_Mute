const DEFAULT_SETTINGS = {
    mode: 'active',
    isExtensionEnabled: true,
    isAllMuted: false,
    rememberLastTab: false,
    firstAudibleTabId: null,
    whitelistedTabId: null,
    muteNewInitialTabIds: [],
    firstSoundSourceHistory: [],
    whitelistSourceHistory: []
};

let cachedSettings = { ...DEFAULT_SETTINGS };
let settingsPromise = null;
let currentIconState = '';
let isCacheInitialized = false;

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
};

const isManageableTab = (tab) => tab?.id && tab.url && !/^(chrome|chrome-extension|edge):\/\//.test(tab.url);

const safeGetTab = (tabId) => chrome.tabs.get(tabId).catch(() => null);

const safeUpdateTab = (tabId, options) => chrome.tabs.update(tabId, options).catch(() => { });

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
            muteNewInitialTabIds: [],
            firstSoundSourceHistory: [],
            whitelistSourceHistory: []
        })
    ]);
    cachedSettings = { ...syncSettings, ...sessionSettings };
    isCacheInitialized = true;
    settingsPromise = null;
    return cachedSettings;
};

const updateSourceHistory = async (mode, newSourceId) => {
    if (!newSourceId) return;
    const historyKey = mode === 'first-sound' ? 'firstSoundSourceHistory' : 'whitelistSourceHistory';
    const history = [newSourceId, ...(cachedSettings[historyKey] || []).filter(id => id !== newSourceId)].slice(0, 3);
    await chrome.storage.session.set({ [historyKey]: history });
};

const getSourceFromHistory = async (mode) => {
    if (!cachedSettings.rememberLastTab) return null;
    const historyKey = mode === 'first-sound' ? 'firstSoundSourceHistory' : 'whitelistSourceHistory';
    const history = cachedSettings[historyKey] || [];
    for (const sourceId of history) {
        const tab = await safeGetTab(sourceId);
        if (tab && isManageableTab(tab) && tab.audible) return sourceId;
    }
    return null;
};

const getSettings = async () => {
    if (settingsPromise) return settingsPromise;
    if (!isCacheInitialized) return refreshCache();
    return cachedSettings;
};

const setTabsMuted = (tabs, mute) => Promise.all(
    tabs.filter(tab => tab.mutedInfo?.muted !== mute).map(tab => safeUpdateTab(tab.id, { muted: mute }))
);

const getUnmuteTargetId = async (settings, activeTabId) => {
    if (settings.mode === 'active') {
        if (activeTabId) return activeTabId;
        const [activeTab] = await safeQueryTabs({ active: true, currentWindow: true });
        return activeTab?.id || null;
    }
    const targetId = settings.mode === 'first-sound' ? settings.firstAudibleTabId : settings.whitelistedTabId;
    return targetId && await safeGetTab(targetId) ? targetId : null;
};

const applyMutingRules = async (settings, activeTabId = null) => {
    const currentSettings = settings || (isCacheInitialized ? cachedSettings : await getSettings());

    if (!currentSettings.isExtensionEnabled) {
        const mutedTabs = await safeQueryTabs({ muted: true });
        return setTabsMuted(mutedTabs.filter(isManageableTab), false);
    }

    if (currentSettings.isAllMuted) {
        const unmutedTabs = await safeQueryTabs({ muted: false });
        return setTabsMuted(unmutedTabs.filter(isManageableTab), true);
    }

    if (currentSettings.mode === 'mute-new') return;

    const tabToUnmuteId = await getUnmuteTargetId(currentSettings, activeTabId);

    const unmutedTabs = await safeQueryTabs({ muted: false });
    const tabsToMute = unmutedTabs.filter(t => isManageableTab(t) && t.id !== tabToUnmuteId);

    const promises = [setTabsMuted(tabsToMute, true)];
    if (tabToUnmuteId) promises.push(safeUpdateTab(tabToUnmuteId, { muted: false }));

    return Promise.all(promises);
};

const debouncedApplyMutingRules = debounce(() => applyMutingRules(cachedSettings), 150);

const ICON_PATHS = {
    default: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    off: { 16: 'icons/icon16_off.png', 48: 'icons/icon48_off.png', 128: 'icons/icon128_off.png' },
    mute: { 16: 'icons/icon16_mute.png', 48: 'icons/icon48_mute.png', 128: 'icons/icon128_mute.png' }
};

const updateExtensionIcon = (settings) => {
    const iconSetKey = !settings.isExtensionEnabled ? 'off' : settings.isAllMuted ? 'mute' : 'default';
    if (currentIconState !== iconSetKey) {
        currentIconState = iconSetKey;
        chrome.action.setIcon({ path: ICON_PATHS[iconSetKey] });
    }
};

const handleAudibleChange = async (tabId, settings) => {
    if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        const [activeTab] = await safeQueryTabs({ active: true, currentWindow: true });
        if (activeTab?.id === tabId) {
            await chrome.storage.session.set({ firstAudibleTabId: tabId });
            return;
        }
    }
    const tabToUnmuteId = await getUnmuteTargetId(settings, null);
    if (tabId !== tabToUnmuteId) {
        const tab = await safeGetTab(tabId);
        if (tab && !tab.mutedInfo?.muted) safeUpdateTab(tabId, { muted: true });
    }
    debouncedApplyMutingRules();
};

const handleModeChange = async (newMode) => {
    if (newMode === 'mute-new') {
        const allTabs = await safeQueryTabs({});
        const manageableTabs = allTabs.filter(isManageableTab);
        await chrome.storage.session.set({ muteNewInitialTabIds: manageableTabs.map(tab => tab.id) });
        if (!cachedSettings.isAllMuted) {
            const mutedManageable = manageableTabs.filter(t => t.mutedInfo?.muted);
            return setTabsMuted(mutedManageable, false);
        }
        return;
    }
    if (newMode === 'first-sound') {
        if (cachedSettings.firstAudibleTabId && await safeGetTab(cachedSettings.firstAudibleTabId)) return;
        await chrome.storage.session.remove('firstAudibleTabId');
        const [activeTab] = await safeQueryTabs({ active: true, currentWindow: true });
        if (activeTab?.audible) {
            await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
        }
        return;
    }
    if (newMode === 'whitelist') {
        if (cachedSettings.whitelistedTabId && !(await safeGetTab(cachedSettings.whitelistedTabId))) {
            await chrome.storage.session.remove('whitelistedTabId');
        }
    }
};

const handleSourceTabIdChange = async ({ oldValue, newValue }, isAllMuted) => {
    if (oldValue) safeUpdateTab(oldValue, { muted: true });
    if (newValue && !isAllMuted) {
        safeUpdateTab(newValue, { muted: false });
        const mode = cachedSettings.mode;
        if (mode === 'first-sound' || mode === 'whitelist') await updateSourceHistory(mode, newValue);
    }
};

const handleMuteAllChange = async ({ newValue: isAllMuted }, settings) => {
    if (isAllMuted === false) {
        if (settings.mode === 'mute-new') {
            const muteNewInitialTabIds = cachedSettings.muteNewInitialTabIds || [];
            const currentlyMutedTabs = await safeQueryTabs({ muted: true });
            const tabsToUnmute = currentlyMutedTabs.filter(tab => muteNewInitialTabIds.includes(tab.id));
            return setTabsMuted(tabsToUnmute, false);
        }

        if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
            const [activeTab] = await safeQueryTabs({ active: true, currentWindow: true });
            if (activeTab?.audible && isManageableTab(activeTab)) {
                await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
                settings.firstAudibleTabId = activeTab.id;
            }
        }
    }
    return applyMutingRules(settings);
};

const handleTabCreation = async (tab) => {
    if (cachedSettings.isExtensionEnabled && !/^(chrome|chrome-extension|edge):\/\//.test(tab.url || '')) {
        let shouldMute = cachedSettings.isAllMuted ||
            (cachedSettings.mode === 'active' && !tab.active) ||
            cachedSettings.mode === 'first-sound' ||
            cachedSettings.mode === 'whitelist';
        if (shouldMute) safeUpdateTab(tab.id, { muted: true });
    }
};

const handleTabActivation = async ({ tabId, windowId }) => {
    const settings = isCacheInitialized ? cachedSettings : await getSettings();
    if (!settings.isExtensionEnabled) return;

    if (settings.isAllMuted) {
        const tab = await safeGetTab(tabId);
        if (tab && !tab.mutedInfo?.muted && isManageableTab(tab)) {
            safeUpdateTab(tabId, { muted: true });
        }
        return;
    }

    if (settings.mode === 'active') {
        const unmutedTabsInWindow = await safeQueryTabs({ windowId, muted: false });
        safeUpdateTab(tabId, { muted: false });
        const promises = unmutedTabsInWindow
            .filter(tab => isManageableTab(tab) && tab.id !== tabId)
            .map(tab => safeUpdateTab(tab.id, { muted: true }));
        return Promise.all(promises);
    }
    if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        const activatedTab = await safeGetTab(tabId);
        if (activatedTab?.audible) await chrome.storage.session.set({ firstAudibleTabId: activatedTab.id });
    }
};

const handleTabUpdate = async (tabId, changeInfo, tab) => {
    const settings = isCacheInitialized ? cachedSettings : await getSettings();
    if (!settings.isExtensionEnabled) return;

    if (settings.isAllMuted) {
        if (!tab.mutedInfo?.muted && isManageableTab(tab)) {
            safeUpdateTab(tabId, { muted: true });
        }
        return;
    }

    if (changeInfo.audible === true) {
        await handleAudibleChange(tabId, settings);
    }
};

const handleTabRemoval = async (tabId) => {
    if (!cachedSettings.isExtensionEnabled) return;
    const keyToUpdate = cachedSettings.mode === 'first-sound' ? 'firstAudibleTabId' : cachedSettings.mode === 'whitelist' ? 'whitelistedTabId' : null;
    if (!keyToUpdate || tabId !== cachedSettings[keyToUpdate]) return;

    await chrome.storage.session.remove(keyToUpdate);

    if (cachedSettings.rememberLastTab) {
        const previousSourceId = await getSourceFromHistory(cachedSettings.mode);
        if (previousSourceId) {
            await chrome.storage.session.set({ [keyToUpdate]: previousSourceId });
        }
    } else if (cachedSettings.mode === 'first-sound') {
        const [activeTab] = await safeQueryTabs({ active: true, currentWindow: true });
        if (activeTab?.audible && isManageableTab(activeTab)) {
            await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
        }
    }
};

const handleStorageChange = async (changes, area) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
        cachedSettings[key] = newValue;
    }

    if (area !== 'sync') {
        const sourceChange = changes.firstAudibleTabId || changes.whitelistedTabId;
        if (sourceChange) handleSourceTabIdChange(sourceChange, cachedSettings.isAllMuted);
        return;
    }
    let needsMutingRuleUpdate = false;
    if (changes.mode) {
        await handleModeChange(changes.mode.newValue);
        needsMutingRuleUpdate = true;
    }
    if (changes.isExtensionEnabled) needsMutingRuleUpdate = true;
    if (changes.isAllMuted) {
        await handleMuteAllChange(changes.isAllMuted, cachedSettings);
    } else if (needsMutingRuleUpdate) {
        await applyMutingRules(cachedSettings);
    }
    if (changes.isExtensionEnabled || changes.isAllMuted) updateExtensionIcon(cachedSettings);
};

const handleCommand = async (command) => {
    const settings = isCacheInitialized ? cachedSettings : await getSettings();
    const commandActions = {
        'toggle-extension': () => chrome.storage.sync.set({ isExtensionEnabled: !settings.isExtensionEnabled }),
        'toggle-mute-all': () => chrome.storage.sync.set({ isAllMuted: !settings.isAllMuted }),
        'set-current-tab-source': async () => {
            if (settings.mode === 'first-sound') {
                const [activeTab] = await safeQueryTabs({ active: true, currentWindow: true });
                if (activeTab && isManageableTab(activeTab)) chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
            }
        }
    };
    if (commandActions[command]) await commandActions[command]();
};

const handleRuntimeMessage = (message, sender, sendResponse) => {
    if (message.action === 'resetMuteNew') {
        (async () => {
            const settings = isCacheInitialized ? cachedSettings : await getSettings();
            const allTabs = await safeQueryTabs({});
            const manageableTabs = allTabs.filter(isManageableTab);
            await chrome.storage.session.set({ muteNewInitialTabIds: manageableTabs.map(tab => tab.id) });
            if (!settings.isAllMuted && settings.isExtensionEnabled) {
                const mutedTabs = manageableTabs.filter(t => t.mutedInfo?.muted);
                await setTabsMuted(mutedTabs, false);
            }
            sendResponse({ success: true });
        })();
        return true;
    }
    return false;
};

const handleInstall = async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.sync.set({ mode: 'active', isExtensionEnabled: true, isAllMuted: false, rememberLastTab: false });
        await chrome.storage.session.set({ firstAudibleTabId: null, whitelistedTabId: null, muteNewInitialTabIds: [] });
    }
    const settings = await refreshCache();
    await Promise.all([applyMutingRules(settings), updateExtensionIcon(settings)]);
};

const handleStartup = async () => {
    settingsPromise = refreshCache();
    const { defaultMode, defaultMuteAll } = await chrome.storage.sync.get({ defaultMode: null, defaultMuteAll: false });
    const updates = {};
    if (defaultMuteAll) updates.isAllMuted = true;
    if (defaultMode) updates.mode = defaultMode;
    if (Object.keys(updates).length > 0) await chrome.storage.sync.set(updates);

    const settings = await getSettings();
    await Promise.all([applyMutingRules(settings), updateExtensionIcon(settings)]);
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