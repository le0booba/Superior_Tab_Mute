const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

const getCombinedSettings = async () => {
    const [syncSettings, sessionSettings] = await Promise.all([
        chrome.storage.sync.get({ mode: 'active', isExtensionEnabled: true, isAllMuted: false, rememberLastTab: false }),
        chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId'])
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

const getUnmuteTargetId = async (settings, activeTabId) => {
    let targetId = null;
    switch (settings.mode) {
        case 'active':
            if (activeTabId) return activeTabId;
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return activeTab?.id;
        case 'first-sound':
            targetId = settings.firstAudibleTabId;
            break;
        case 'whitelist':
            targetId = settings.whitelistedTabId;
            break;
    }
    if (!targetId) return null;
    try {
        await chrome.tabs.get(targetId);
        return targetId;
    } catch (e) {
        return null;
    }
};

const applyMutingRules = async (activeTabId = null, providedSettings = null) => {
    const settings = providedSettings || await getCombinedSettings();
    if (!settings.isExtensionEnabled) {
        const tabsToUpdate = (await chrome.tabs.query({})).filter(isManageableTab);
        return setMuteStatusForTabs(tabsToUpdate, false);
    }
    if (settings.isAllMuted) {
        const tabsToUpdate = (await chrome.tabs.query({})).filter(isManageableTab);
        return setMuteStatusForTabs(tabsToUpdate, true);
    }
    if (settings.mode === 'mute-new') return;
    const tabToUnmuteId = await getUnmuteTargetId(settings, activeTabId);
    const tabsToMute = await chrome.tabs.query({ muted: false });
    const mutePromises = tabsToMute
        .filter(tab => isManageableTab(tab) && tab.id !== tabToUnmuteId)
        .map(tab => chrome.tabs.update(tab.id, { muted: true }).catch(e => console.warn(`Could not mute tab ${tab.id}: ${e.message}`)));
    await Promise.all(mutePromises);
    if (tabToUnmuteId) {
        try {
            const targetTab = await chrome.tabs.get(tabToUnmuteId);
            if (targetTab.mutedInfo?.muted) {
                await chrome.tabs.update(tabToUnmuteId, { muted: false }).catch(e => console.warn(`Could not unmute tab ${tabToUnmuteId}: ${e.message}`));
            }
        } catch (e) {}
    }
};

const debouncedApplyMutingRules = debounce(applyMutingRules, 150);

const updateExtensionIcon = async () => {
    const { isExtensionEnabled, isAllMuted } = await getCombinedSettings();
    let iconSetKey = 'default';
    if (!isExtensionEnabled) iconSetKey = 'off';
    else if (isAllMuted) iconSetKey = 'mute';
    const paths = {
        'default': { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
        'off': { 16: 'icons/icon16_off.png', 48: 'icons/icon48_off.png', 128: 'icons/icon128_off.png' },
        'mute': { 16: 'icons/icon16_mute.png', 48: 'icons/icon48_mute.png', 128: 'icons/icon128_mute.png' },
    };
    chrome.action.setIcon({ path: paths[iconSetKey] });
};

const updatePopupData = async () => {
    try {
        const allTabs = await chrome.tabs.query({});
        const manageableTabs = allTabs.filter(isManageableTab);
        const format = (tab) => ({ id: tab.id, title: tab.title, favIconUrl: tab.favIconUrl, audible: tab.audible, url: tab.url });
        const popupTabsData = manageableTabs.map(format);
        await chrome.storage.session.set({ popupTabsData });
    } catch (error) {
        console.warn("Error updating popup data:", error.message);
    }
};

const debouncedUpdatePopupData = debounce(updatePopupData, 150);

const handleInstall = (details) => {
    if (details.reason === 'install') {
        chrome.storage.sync.set({ mode: 'active', isExtensionEnabled: true, isAllMuted: false, rememberLastTab: false });
        chrome.storage.session.set({ firstAudibleTabId: null, whitelistedTabId: null, muteNewInitialTabIds: [] });
    }
    debouncedUpdatePopupData();
};

const handleTabCreation = async (tab) => {
    const { mode, isExtensionEnabled, isAllMuted } = await getCombinedSettings();
    if (isExtensionEnabled && isManageableTab(tab)) {
        const shouldMute = isAllMuted || mode !== 'active' || !tab.active;
        if (shouldMute) {
            chrome.tabs.update(tab.id, { muted: true }).catch((e) => console.warn(`Could not update new tab ${tab.id}: ${e.message}`));
        }
    }
    debouncedUpdatePopupData();
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
    } else if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        try {
            const activatedTab = await chrome.tabs.get(tabId);
            if (activatedTab?.audible) {
                await chrome.storage.session.set({ firstAudibleTabId: activatedTab.id });
            }
        } catch (e) { console.warn(`Could not get activated tab ${tabId}: ${e.message}`); }
    }
};

const handleTabUpdate = async (tabId, changeInfo) => {
    if (changeInfo.audible !== undefined || changeInfo.title !== undefined || changeInfo.favIconUrl !== undefined) {
        debouncedUpdatePopupData();
    }

    const settings = await getCombinedSettings();
    if (!settings.isExtensionEnabled || settings.isAllMuted) return;

    if (changeInfo.audible === true) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (settings.mode === 'first-sound' && !settings.firstAudibleTabId && activeTab?.id === tabId) {
            await chrome.storage.session.set({ firstAudibleTabId: tabId });
            return;
        }

        const tabToUnmuteId = await getUnmuteTargetId(settings, activeTab?.id);

        if (tabId !== tabToUnmuteId) {
            chrome.tabs.update(tabId, { muted: true }).catch(e => console.warn(`Immediate mute failed for tab ${tabId}: ${e.message}`));
        }
        
        debouncedApplyMutingRules();
    }
};

const handleTabRemoval = async (tabId) => {
    debouncedUpdatePopupData();
    const settings = await getCombinedSettings();
    if (!settings.isExtensionEnabled) return;
    const keyToUpdate = settings.mode === 'first-sound' ? 'firstAudibleTabId' : (settings.mode === 'whitelist' ? 'whitelistedTabId' : null);
    if (!keyToUpdate || tabId !== settings[keyToUpdate]) return;
    if (settings.rememberLastTab) {
        const audibleTabs = await chrome.tabs.query({ audible: true });
        const newSourceTab = audibleTabs.find(tab => tab.id !== tabId);
        if (newSourceTab) {
            await chrome.storage.session.set({ [keyToUpdate]: newSourceTab.id });
            return;
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
};

const handleStorageChange = async (changes) => {
    const muteTab = (tabId) => chrome.tabs.update(tabId, { muted: true }).catch(() => {});
    const unmuteTab = (tabId) => chrome.tabs.update(tabId, { muted: false }).catch(() => {});

    if (changes.firstAudibleTabId || changes.whitelistedTabId) {
        const { oldValue, newValue } = changes.firstAudibleTabId || changes.whitelistedTabId;
        if (oldValue) muteTab(oldValue);
        if (newValue) unmuteTab(newValue);
        return;
    }

    if (changes.isAllMuted) {
        if (changes.isAllMuted.newValue === false) {
            const { mode } = await chrome.storage.sync.get('mode');
            if (mode === 'mute-new') {
                const { muteNewInitialTabIds = [] } = await chrome.storage.session.get('muteNewInitialTabIds');
                const currentlyMutedTabs = await chrome.tabs.query({ muted: true });
                const tabsToUnmute = currentlyMutedTabs.filter(tab => muteNewInitialTabIds.includes(tab.id));
                await setMuteStatusForTabs(tabsToUnmute, false);
            } else {
                applyMutingRules();
            }
        } else {
            applyMutingRules();
        }
    } else if (changes.mode || changes.isExtensionEnabled) {
        debouncedApplyMutingRules();
    }

    if ('isExtensionEnabled' in changes || 'isAllMuted' in changes) {
        updateExtensionIcon();
    }

    if (changes.mode) {
        const newMode = changes.mode.newValue;
        if (newMode === 'mute-new') {
            const manageableTabs = (await chrome.tabs.query({})).filter(isManageableTab);
            const initialIds = manageableTabs.map(tab => tab.id);
            await chrome.storage.session.set({ muteNewInitialTabIds: initialIds });
            await setMuteStatusForTabs(manageableTabs, false);
        } else if (newMode === 'first-sound') {
            const { firstAudibleTabId } = await chrome.storage.session.get('firstAudibleTabId');
            if (firstAudibleTabId) {
                try { await chrome.tabs.get(firstAudibleTabId); } catch (e) {
                    await chrome.storage.session.remove('firstAudibleTabId');
                }
            } else {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab?.audible) await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
            }
        } else if (newMode === 'whitelist') {
            const { whitelistedTabId } = await chrome.storage.session.get('whitelistedTabId');
            if (whitelistedTabId) {
                try { await chrome.tabs.get(whitelistedTabId); } catch (e) {
                    await chrome.storage.session.remove('whitelistedTabId');
                }
            }
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
            const initialIds = manageableTabs.map(tab => tab.id);
            await chrome.storage.session.set({ muteNewInitialTabIds: initialIds });
            await setMuteStatusForTabs(manageableTabs, false);
            sendResponse({ success: true });
        };
        unmuteAllAndReset();
        return true;
    }
};

chrome.runtime.onInstalled.addListener(handleInstall);
chrome.runtime.onStartup.addListener(async () => {
    const { defaultMode, defaultMuteAll } = await chrome.storage.sync.get({ defaultMode: null, defaultMuteAll: false });
    if (defaultMuteAll) {
        await chrome.storage.sync.set({ isAllMuted: true });
    }
    if (defaultMode) {
        await chrome.storage.sync.set({ mode: defaultMode });
    }
});
chrome.tabs.onCreated.addListener(handleTabCreation);
chrome.tabs.onActivated.addListener(handleTabActivation);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.storage.onChanged.addListener(handleStorageChange);
chrome.commands.onCommand.addListener(handleCommand);
chrome.runtime.onMessage.addListener(handleRuntimeMessage);

updateExtensionIcon();
updatePopupData();
applyMutingRules();