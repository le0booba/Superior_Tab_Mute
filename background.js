const getCombinedSettings = async () => {
    const [syncSettings, sessionSettings] = await Promise.all([
        chrome.storage.sync.get(['mode', 'isExtensionEnabled', 'isAllMuted']),
        chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId'])
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
    });
    chrome.storage.session.set({
        firstAudibleTabId: null,
        whitelistedTabId: null,
    });
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
    if (changeInfo.audible !== true) return;
    
    const settings = await getCombinedSettings();
    if (settings.isExtensionEnabled && settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id === tabId) {
            await chrome.storage.session.set({ firstAudibleTabId: tabId });
            return;
        }
    }
    applyMutingRules();
};

const handleTabRemoval = async (tabId) => {
    const settings = await getCombinedSettings();
    let needsRuleUpdate = settings.isExtensionEnabled;
    let storageUpdate = {};

    if (settings.mode === 'first-sound' && tabId === settings.firstAudibleTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.audible) {
            storageUpdate = { firstAudibleTabId: activeTab.id };
        } else {
            await chrome.storage.session.remove('firstAudibleTabId');
        }
    } else if (settings.mode === 'whitelist' && tabId === settings.whitelistedTabId) {
        await chrome.storage.session.remove('whitelistedTabId');
    } else {
        needsRuleUpdate = false;
    }
    
    if (Object.keys(storageUpdate).length > 0) {
        await chrome.storage.session.set(storageUpdate);
    }

    if (needsRuleUpdate) {
        applyMutingRules();
    }
};

const handleStorageChange = async (changes, area) => {
    if (area !== 'sync' && area !== 'session') return;

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
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.commands.onCommand.addListener(handleCommand);

updateExtensionIcon();