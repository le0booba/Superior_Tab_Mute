const getCombinedSettings = async () => {
    const [syncSettings, sessionSettings] = await Promise.all([
        chrome.storage.sync.get(['mode', 'isExtensionEnabled', 'isAllMuted', 'rememberLastTab']),
        chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId', 'audibleHistory'])
    ]);
    return { ...syncSettings, ...sessionSettings };
};

const setMuteStatusForTabs = (tabs, mute) => Promise.all(
    tabs.map(tab => {
        if (tab.mutedInfo?.muted !== mute) {
            return chrome.tabs.update(tab.id, { muted: mute }).catch(() => {});
        }
        return Promise.resolve();
    })
);

const getUnmuteTargetId = async (settings, allTabs, activeTabId) => {
    const allTabsById = new Map(allTabs.map(tab => [tab.id, tab]));

    switch (settings.mode) {
        case 'active':
            if (activeTabId) return activeTabId;
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return activeTab?.id;

        case 'first-sound':
            return settings.firstAudibleTabId && allTabsById.has(settings.firstAudibleTabId)
                ? settings.firstAudibleTabId
                : null;

        case 'whitelist':
            return settings.whitelistedTabId && allTabsById.has(settings.whitelistedTabId)
                ? settings.whitelistedTabId
                : null;

        default:
            return null;
    }
};

const applyMutingRules = async (activeTabId = null) => {
    const [settings, allTabs] = await Promise.all([
        getCombinedSettings(),
        chrome.tabs.query({})
    ]);

    const manageableTabs = allTabs.filter(tab => tab.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'));

    if (!settings.isExtensionEnabled) {
        return setMuteStatusForTabs(manageableTabs, false);
    }
    if (settings.isAllMuted) {
        return setMuteStatusForTabs(manageableTabs, true);
    }

    if (settings.mode === 'mute-new') {
        return;
    }

    const tabToUnmuteId = await getUnmuteTargetId(settings, allTabs, activeTabId);

    const tabsToMute = manageableTabs.filter(tab => tab.id !== tabToUnmuteId);
    const tabsToUnmute = manageableTabs.filter(tab => tab.id === tabToUnmuteId);

    await Promise.all([
        setMuteStatusForTabs(tabsToMute, true),
        setMuteStatusForTabs(tabsToUnmute, false),
    ]);
};

const updateExtensionIcon = async () => {
    const { isExtensionEnabled, isAllMuted } = await getCombinedSettings();
    let iconSetKey = 'default';
    if (!isExtensionEnabled) {
        iconSetKey = 'off';
    } else if (isAllMuted) {
        iconSetKey = 'mute';
    }
    const paths = {
        'default': { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
        'off': { 16: 'icons/icon16_off.png', 48: 'icons/icon48_off.png', 128: 'icons/icon128_off.png' },
        'mute': { 16: 'icons/icon16_mute.png', 48: 'icons/icon48_mute.png', 128: 'icons/icon128_mute.png' },
    };
    chrome.action.setIcon({ path: paths[iconSetKey] });
};

const handleInstall = () => {
    chrome.storage.sync.set({
        mode: 'active',
        isExtensionEnabled: true,
        isAllMuted: false,
        rememberLastTab: false,
    });
    chrome.storage.session.set({
        firstAudibleTabId: null,
        whitelistedTabId: null,
        audibleHistory: [],
    });
};

const handleTabCreation = async (tab) => {
    const { mode, isExtensionEnabled, isAllMuted } = await getCombinedSettings();
    if (isExtensionEnabled && !isAllMuted && mode === 'mute-new') {
        if (tab.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
             chrome.tabs.update(tab.id, { muted: true }).catch(() => {});
        }
    }
};

const handleTabActivation = async ({ tabId }) => {
    const settings = await getCombinedSettings();
    if (settings.isExtensionEnabled && settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        try {
            const activatedTab = await chrome.tabs.get(tabId);
            if (activatedTab?.audible) {
                await chrome.storage.session.set({ firstAudibleTabId: activatedTab.id });
                return;
            }
        } catch (e) {}
    }
    applyMutingRules(tabId);
};

const handleTabUpdate = async (tabId, changeInfo) => {
    if (typeof changeInfo.audible === 'boolean') {
        const { audibleHistory: currentHistory = [] } = await chrome.storage.session.get('audibleHistory');
        const history = [...currentHistory];
        const existingIndex = history.indexOf(tabId);
        if (existingIndex > -1) {
            history.splice(existingIndex, 1);
        }
        if (changeInfo.audible) {
            history.unshift(tabId);
            if (history.length > 20) history.length = 20;
            await chrome.storage.session.set({ audibleHistory: history });
        } else {
            if (existingIndex > -1) {
                await chrome.storage.session.set({ audibleHistory: history });
            }
        }
    }

    const settings = await getCombinedSettings();
    if (!settings.isExtensionEnabled) return;

    if (changeInfo.audible === false && settings.rememberLastTab) {
        const currentSourceId = settings.mode === 'first-sound' ? settings.firstAudibleTabId : (settings.mode === 'whitelist' ? settings.whitelistedTabId : null);
        if (tabId === currentSourceId) {
            const history = settings.audibleHistory || [];
            const allTabs = await chrome.tabs.query({});
            const allTabsById = new Map(allTabs.map(t => [t.id, t]));

            for (const historicTabId of history) {
                if (historicTabId === tabId) continue;
                const tab = allTabsById.get(historicTabId);
                if (tab && tab.audible) {
                    const keyToUpdate = settings.mode === 'first-sound' ? 'firstAudibleTabId' : 'whitelistedTabId';
                    await chrome.storage.session.set({ [keyToUpdate]: historicTabId });
                    return;
                }
            }
            const keyToUpdate = settings.mode === 'first-sound' ? 'firstAudibleTabId' : 'whitelistedTabId';
            await chrome.storage.session.remove(keyToUpdate);
            return;
        }
    }

    if (changeInfo.audible === true) {
        if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab?.id === tabId) {
                await chrome.storage.session.set({ firstAudibleTabId: tabId });
                return;
            }
        }
        applyMutingRules();
    }
};

const handleTabRemoval = async (tabId) => {
    const { audibleHistory: currentHistory = [] } = await chrome.storage.session.get('audibleHistory');
    const history = currentHistory.filter(id => id !== tabId);
    if (history.length !== currentHistory.length) {
        await chrome.storage.session.set({ audibleHistory: history });
    }

    const settings = await getCombinedSettings();
    if (!settings.isExtensionEnabled) return;

    const keyToUpdate = settings.mode === 'first-sound' ? 'firstAudibleTabId' : (settings.mode === 'whitelist' ? 'whitelistedTabId' : null);
    if (!keyToUpdate) return;
    
    const currentSourceId = settings[keyToUpdate];

    if (tabId === currentSourceId) {
        if (settings.rememberLastTab) {
            const allTabs = await chrome.tabs.query({});
            const allTabsById = new Map(allTabs.map(t => [t.id, t]));
            for (const historicTabId of history) {
                 const tab = allTabsById.get(historicTabId);
                 if (tab && tab.audible) {
                     await chrome.storage.session.set({ [keyToUpdate]: historicTabId });
                     return;
                 }
            }
        }
        
        if (settings.mode === 'first-sound') {
             const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
             if (activeTab?.audible) {
                await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
                return;
             }
        }
        
        await chrome.storage.session.remove(keyToUpdate);
    }
};

const handleStorageChange = async (changes, area) => {
    if (area !== 'sync' && area !== 'session') return;

    if (changes.mode?.newValue === 'mute-new') {
        const allTabs = await chrome.tabs.query({});
        const manageableTabs = allTabs.filter(tab => tab.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'));
        await setMuteStatusForTabs(manageableTabs, false);
    }

    if (changes.mode?.newValue === 'first-sound') {
        const { firstAudibleTabId } = await chrome.storage.session.get('firstAudibleTabId');
        if (!firstAudibleTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab?.audible) {
                await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
            }
        }
    }

    const needsRuleUpdate = ['mode', 'isExtensionEnabled', 'isAllMuted', 'firstAudibleTabId', 'whitelistedTabId'].some(key => key in changes);
    if (needsRuleUpdate) {
        applyMutingRules();
    }
    if ('isExtensionEnabled' in changes || 'isAllMuted' in changes) {
        updateExtensionIcon();
    }
};

const handleCommand = async (command) => {
    const { isExtensionEnabled, isAllMuted, mode } = await getCombinedSettings();
    switch (command) {
        case 'toggle-extension':
            chrome.storage.sync.set({ isExtensionEnabled: !isExtensionEnabled });
            break;
        case 'toggle-mute-all':
            chrome.storage.sync.set({ isAllMuted: !isAllMuted });
            break;
        case 'set-current-tab-source':
            if (mode === 'first-sound') {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab) {
                    chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
                }
            }
            break;
    }
};

chrome.runtime.onInstalled.addListener(handleInstall);
chrome.tabs.onCreated.addListener(handleTabCreation);
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.commands.onCommand.addListener(handleCommand);

updateExtensionIcon();