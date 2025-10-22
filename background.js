const getCombinedSettings = async () => {
    const [syncSettings, sessionSettings] = await Promise.all([
        chrome.storage.sync.get(['mode', 'isExtensionEnabled', 'isAllMuted', 'rememberLastTab']),
        chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId', 'audibleHistory'])
    ]);
    return { ...syncSettings, ...sessionSettings };
};

const isManageableTab = (tab) => tab.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://');

const setMuteStatusForTabs = (tabs, mute) => Promise.all(
    tabs.map(tab => {
        if (tab.mutedInfo?.muted !== mute) {
            return chrome.tabs.update(tab.id, { muted: mute }).catch((e) => console.warn(`Could not update tab ${tab.id}: ${e.message}`));
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

const applyMutingRules = async (activeTabId = null, providedSettings = null) => {
    const settings = providedSettings || await getCombinedSettings();
    const allTabs = await chrome.tabs.query({});
    const manageableTabs = allTabs.filter(isManageableTab);

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

    const updatePromises = manageableTabs.map(tab => {
        const shouldBeMuted = tab.id !== tabToUnmuteId;
        if (tab.mutedInfo?.muted !== shouldBeMuted) {
            return chrome.tabs.update(tab.id, { muted: shouldBeMuted }).catch((e) => console.warn(`Could not update tab ${tab.id}: ${e.message}`));
        }
        return null;
    }).filter(Boolean);

    await Promise.all(updatePromises);
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

const handleInstall = (details) => {
    if (details.reason === 'install') {
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
    }
};

const handleTabCreation = async (tab) => {
    const { mode, isExtensionEnabled, isAllMuted } = await getCombinedSettings();
    if (isExtensionEnabled && !isAllMuted && mode === 'mute-new' && isManageableTab(tab)) {
        chrome.tabs.update(tab.id, { muted: true }).catch((e) => console.warn(`Could not update tab ${tab.id}: ${e.message}`));
    }
};

const handleTabActivation = async ({ tabId, windowId }) => {
    const settings = await getCombinedSettings();
    if (!settings.isExtensionEnabled || settings.isAllMuted) return;

    if (settings.mode === 'active') {
        const manageableTabsInWindow = (await chrome.tabs.query({ windowId })).filter(isManageableTab);

        const updatePromises = manageableTabsInWindow.map(tab => {
            const shouldBeMuted = tab.id !== tabId;
            if (tab.mutedInfo?.muted !== shouldBeMuted) {
                return chrome.tabs.update(tab.id, { muted: shouldBeMuted }).catch((e) => console.warn(`Could not update tab ${tab.id}: ${e.message}`));
            }
            return null;
        }).filter(Boolean);
        
        await Promise.all(updatePromises);
        return;
    }

    if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        try {
            const activatedTab = await chrome.tabs.get(tabId);
            if (activatedTab?.audible) {
                await chrome.storage.session.set({ firstAudibleTabId: activatedTab.id });
                return;
            }
        } catch (e) {
            console.warn(`Could not get activated tab ${tabId}: ${e.message}`);
        }
    }
    
    applyMutingRules(tabId, settings);
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
        }
        await chrome.storage.session.set({ audibleHistory: history });
    }

    const settings = await getCombinedSettings();
    if (!settings.isExtensionEnabled) return;

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
            for (const historicTabId of history) {
                 try {
                     const tab = await chrome.tabs.get(historicTabId);
                     if (tab?.audible) {
                         await chrome.storage.session.set({ [keyToUpdate]: historicTabId });
                         return;
                     }
                 } catch (e) { /* Tab might be closed, ignore */ }
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

const handleStorageChange = async (changes) => {
    const needsRuleUpdate = ['mode', 'isExtensionEnabled', 'isAllMuted', 'firstAudibleTabId', 'whitelistedTabId'].some(key => key in changes);
    if (needsRuleUpdate) {
        applyMutingRules();
    }
    if ('isExtensionEnabled' in changes || 'isAllMuted' in changes) {
        updateExtensionIcon();
    }

    if (changes.mode) {
        const newMode = changes.mode.newValue;
        if (newMode === 'first-sound') {
            const { firstAudibleTabId } = await chrome.storage.session.get('firstAudibleTabId');
            if (firstAudibleTabId) {
                try { await chrome.tabs.get(firstAudibleTabId); } catch (e) {
                    await chrome.storage.session.remove('firstAudibleTabId');
                }
            } else {
                 const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                 if (activeTab?.audible) {
                    await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
                 }
            }
        } else if (newMode === 'whitelist') {
            const { whitelistedTabId } = await chrome.storage.session.get('whitelistedTabId');
            if (whitelistedTabId) {
                try { await chrome.tabs.get(whitelistedTabId); } catch (e) {
                    await chrome.storage.session.remove('whitelistedTabId');
                }
            }
        } else if (newMode === 'mute-new') {
            const manageableTabs = (await chrome.tabs.query({})).filter(isManageableTab);
            await setMuteStatusForTabs(manageableTabs, false);
        }
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
                if (activeTab && isManageableTab(activeTab)) {
                    chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
                }
            }
            break;
    }
};

const handleRuntimeMessage = (message, sender, sendResponse) => {
    if (message.action === 'resetMuteNew') {
        const unmuteAllAndReset = async () => {
            const manageableTabs = (await chrome.tabs.query({})).filter(isManageableTab);
            await setMuteStatusForTabs(manageableTabs, false);
        };
        unmuteAllAndReset();
        return true;
    }
};

chrome.runtime.onInstalled.addListener(handleInstall);
chrome.tabs.onCreated.addListener(handleTabCreation);
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.commands.onCommand.addListener(handleCommand);
chrome.runtime.onMessage.addListener(handleRuntimeMessage);

updateExtensionIcon();