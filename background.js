const DEFAULT_SETTINGS = {
    mode: 'active',
    isExtensionEnabled: true,
    isAllMuted: false,
    rememberLastTab: false,
    firstAudibleTabId: null,
    whitelistedTabId: null,
    muteNewInitialTabIds: [],
    firstSoundSourceHistory: [],
    whitelistSourceHistory: [],
    alwaysAllowList: [],
    alwaysBlockList: [],
    exceptionModes: ['active', 'first-sound', 'whitelist', 'mute-new']
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
    const [syncSettings, localSettings, sessionSettings] = await Promise.all([
        chrome.storage.sync.get({
            mode: 'active',
            isExtensionEnabled: true,
            isAllMuted: false,
            rememberLastTab: false,
            exceptionModes: ['active', 'first-sound', 'whitelist', 'mute-new']
        }),
        chrome.storage.local.get({
            alwaysAllowList: [],
            alwaysBlockList: []
        }),
        chrome.storage.session.get({
            firstAudibleTabId: null,
            whitelistedTabId: null,
            muteNewInitialTabIds: [],
            firstSoundSourceHistory: [],
            whitelistSourceHistory: []
        })
    ]);
    cachedSettings = { ...syncSettings, ...localSettings, ...sessionSettings };
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

const decodePunycode = (input) => {
    if (!input.includes('xn--')) return input;
    return input.split('.').map(part => {
        if (!part.startsWith('xn--')) return part;
        let str = part.slice(4);
        let n = 128;
        let i = 0;
        let bias = 72;
        let output = [];
        
        let delim = str.lastIndexOf('-');
        if (delim >= 0) {
            for (let j = 0; j < delim; j++) {
                output.push(str.charCodeAt(j));
            }
            str = str.slice(delim + 1);
        }
        
        let pos = 0;
        while (pos < str.length) {
            let oldi = i;
            let w = 1;
            for (let k = 36; ; k += 36) {
                let digit = str.charCodeAt(pos++);
                digit = digit >= 97 && digit <= 122 ? digit - 97 :
                        digit >= 48 && digit <= 57 ? digit - 22 :
                        digit >= 65 && digit <= 90 ? digit - 65 : 36;
                i += digit * w;
                let t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
                if (digit < t) break;
                w *= (36 - t);
            }
            let len = output.length + 1;
            let delta = i - oldi;
            delta = oldi === 0 ? Math.floor(delta / 700) : Math.floor(delta / 2);
            delta += Math.floor(delta / len);
            let k = 0;
            while (delta > 455) {
                delta = Math.floor(delta / 35);
                k += 36;
            }
            bias = k + Math.floor((36 * delta) / (delta + 38));
            n += Math.floor(i / len);
            i %= len;
            output.splice(i, 0, n);
            i++;
        }
        return String.fromCodePoint(...output);
    }).join('.');
};

const cleanPattern = (pattern) => {
    pattern = pattern.trim().toLowerCase();
    if (!pattern) return '';

    if (pattern.includes('://')) {
        pattern = pattern.split('://')[1];
    }
    pattern = pattern.split(/[/?#]/)[0];

    pattern = pattern.replace(/[^\p{L}\p{N}\.*\-_]/gu, '');

    pattern = pattern.replace(/\.{2,}/g, '.');

    if (pattern.startsWith('*') && !pattern.startsWith('*.')) {
        pattern = '*.' + pattern.slice(1);
    }
    if (pattern.startsWith('.*')) {
        pattern = '*.' + pattern.slice(2);
    }
    if (pattern.endsWith('*') && !pattern.endsWith('.*')) {
        pattern = pattern.slice(0, -1) + '.*';
    }

    if (pattern.startsWith('www.')) {
        pattern = pattern.slice(4);
    }
    if (pattern.startsWith('*.www.')) {
        pattern = '*.' + pattern.slice(6);
    }

    return pattern;
};

const normalizeHost = (host) => {
    host = host.toLowerCase().trim();
    host = decodePunycode(host);
    if (host.startsWith('www.')) {
        host = host.slice(4);
    }
    return host;
};

const getNonTldHost = (host) => {
    const parts = host.split('.');
    if (parts.length <= 1) return host;
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    const commonSecondLevels = ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'mil'];
    if (parts.length >= 3 && commonSecondLevels.includes(prev) && last.length === 2) {
        return parts.slice(0, -2).join('.');
    }
    return parts.slice(0, -1).join('.');
};

const matchPattern = (host, pattern) => {
    host = normalizeHost(host);
    pattern = cleanPattern(pattern);
    if (!pattern) return false;

    const isSingleWord = !pattern.includes('.') && !pattern.includes('*');
    if (isSingleWord) {
        const nonTld = getNonTldHost(host);
        return nonTld.split('.').includes(pattern);
    }

    if (pattern.startsWith('*.')) {
        const domain = pattern.slice(2);
        return host === domain || host.endsWith('.' + domain);
    }
    if (pattern.endsWith('.*')) {
        const word = pattern.slice(0, -2);
        return host === word || host.startsWith(word + '.');
    }
    if (pattern === host) {
        return true;
    }
    return false;
};

const matchesList = (url, list) => {
    if (!url || !list || !Array.isArray(list)) return false;
    let host = url;
    try {
        const parsedUrl = new URL(url);
        host = parsedUrl.hostname;
    } catch {}
    
    return list.some(pattern => matchPattern(host, pattern));
};

const getExceptionMutedState = (tab, settings) => {
    if (!settings.isExtensionEnabled || settings.isAllMuted) return null;
    if (!settings.exceptionModes || !settings.exceptionModes.includes(settings.mode)) return null;
    if (!isManageableTab(tab)) return null;

    if (matchesList(tab.url, settings.alwaysBlockList)) {
        return true;
    }
    if (matchesList(tab.url, settings.alwaysAllowList)) {
        return false;
    }
    return null;
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

    const allTabs = await safeQueryTabs({});
    const manageableTabs = allTabs.filter(isManageableTab);
    const tabToUnmuteId = currentSettings.mode === 'mute-new' ? null : await getUnmuteTargetId(currentSettings, activeTabId);
    const promises = [];

    for (const tab of manageableTabs) {
        const exceptionState = getExceptionMutedState(tab, currentSettings);
        if (exceptionState !== null) {
            if (tab.mutedInfo?.muted !== exceptionState) {
                promises.push(safeUpdateTab(tab.id, { muted: exceptionState }));
            }
        } else {
            if (currentSettings.mode === 'mute-new') {
                const muteNewInitialTabIds = currentSettings.muteNewInitialTabIds || [];
                const shouldMute = !muteNewInitialTabIds.includes(tab.id);
                if (tab.mutedInfo?.muted !== shouldMute) {
                    promises.push(safeUpdateTab(tab.id, { muted: shouldMute }));
                }
            } else {
                const shouldMute = tab.id !== tabToUnmuteId;
                if (tab.mutedInfo?.muted !== shouldMute) {
                    promises.push(safeUpdateTab(tab.id, { muted: shouldMute }));
                }
            }
        }
    }

    return Promise.all(promises);
};

const debouncedApplyMutingRules = debounce(async () => {
    const settings = isCacheInitialized ? cachedSettings : await getSettings();
    applyMutingRules(settings);
}, 150);

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
            const exceptionState = getExceptionMutedState(activeTab, settings);
            if (exceptionState !== true) {
                await chrome.storage.session.set({ firstAudibleTabId: tabId });
                return;
            }
        }
    }
    const tabToUnmuteId = await getUnmuteTargetId(settings, null);
    if (tabId !== tabToUnmuteId) {
        const tab = await safeGetTab(tabId);
        if (tab && isManageableTab(tab)) {
            const exceptionState = getExceptionMutedState(tab, settings);
            if (exceptionState !== null) {
                if (tab.mutedInfo?.muted !== exceptionState) safeUpdateTab(tabId, { muted: exceptionState });
            } else {
                if (!tab.mutedInfo?.muted) safeUpdateTab(tabId, { muted: true });
            }
        }
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
    const settings = isCacheInitialized ? cachedSettings : await getSettings();
    if (settings.isExtensionEnabled && !/^(chrome|chrome-extension|edge):\/\//.test(tab.url || '')) {
        const exceptionState = getExceptionMutedState(tab, settings);
        if (exceptionState !== null) {
            safeUpdateTab(tab.id, { muted: exceptionState });
        } else {
            let shouldMute = settings.isAllMuted ||
                (settings.mode === 'active' && !tab.active) ||
                settings.mode === 'first-sound' ||
                settings.mode === 'whitelist' ||
                (settings.mode === 'mute-new' && !(settings.muteNewInitialTabIds || []).includes(tab.id));
            if (shouldMute) safeUpdateTab(tab.id, { muted: true });
        }
    }
};

const handleTabActivation = async ({ tabId, windowId }) => {
    const settings = isCacheInitialized ? cachedSettings : await getSettings();
    if (!settings.isExtensionEnabled) return;

    if (settings.mode === 'active' || settings.isAllMuted) {
        await applyMutingRules(settings, tabId);
    } else if (settings.mode === 'first-sound' && !settings.firstAudibleTabId) {
        const activatedTab = await safeGetTab(tabId);
        if (activatedTab?.audible && isManageableTab(activatedTab)) {
            const exceptionState = getExceptionMutedState(activatedTab, settings);
            if (exceptionState !== true) {
                await chrome.storage.session.set({ firstAudibleTabId: activatedTab.id });
            }
        }
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

    const exceptionState = getExceptionMutedState(tab, settings);
    if (exceptionState !== null) {
        if (tab.mutedInfo?.muted !== exceptionState) {
            await safeUpdateTab(tabId, { muted: exceptionState });
        }
    }

    if (changeInfo.audible === true) {
        await handleAudibleChange(tabId, settings);
    } else if (changeInfo.url) {
        await applyMutingRules(settings);
    }
};

const handleTabRemoval = async (tabId) => {
    const settings = isCacheInitialized ? cachedSettings : await getSettings();
    if (!settings.isExtensionEnabled) return;
    const keyToUpdate = settings.mode === 'first-sound' ? 'firstAudibleTabId' : settings.mode === 'whitelist' ? 'whitelistedTabId' : null;
    if (!keyToUpdate || tabId !== settings[keyToUpdate]) return;

    await chrome.storage.session.remove(keyToUpdate);

    if (settings.mode === 'first-sound') {
        let newSourceId = null;
        if (settings.rememberLastTab) {
            newSourceId = await getSourceFromHistory(settings.mode);
        }
        if (!newSourceId) {
            const [activeTab] = await safeQueryTabs({ active: true, currentWindow: true });
            if (activeTab?.audible && isManageableTab(activeTab)) {
                newSourceId = activeTab.id;
            }
        }
        if (newSourceId) {
            await chrome.storage.session.set({ firstAudibleTabId: newSourceId });
        }
    } else if (settings.mode === 'whitelist' && settings.rememberLastTab) {
        const previousSourceId = await getSourceFromHistory(settings.mode);
        if (previousSourceId) {
            await chrome.storage.session.set({ whitelistedTabId: previousSourceId });
        }
    }
};

const handleStorageChange = async (changes, area) => {
    if (!isCacheInitialized) await getSettings();
    for (const [key, { newValue }] of Object.entries(changes)) {
        cachedSettings[key] = newValue;
    }

    if (area !== 'sync') {
        const sourceChange = changes.firstAudibleTabId || changes.whitelistedTabId;
        if (sourceChange) handleSourceTabIdChange(sourceChange, cachedSettings.isAllMuted);
        if (area === 'local' && (changes.alwaysAllowList || changes.alwaysBlockList)) {
            await applyMutingRules(cachedSettings);
        }
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
    } else if (needsMutingRuleUpdate || changes.exceptionModes) {
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
        await chrome.storage.sync.set({
            mode: 'active',
            isExtensionEnabled: true,
            isAllMuted: false,
            rememberLastTab: false,
            exceptionModes: ['active', 'first-sound', 'whitelist', 'mute-new']
        });
        await chrome.storage.local.set({
            alwaysAllowList: [],
            alwaysBlockList: []
        });
        await chrome.storage.session.set({
            firstAudibleTabId: null,
            whitelistedTabId: null,
            muteNewInitialTabIds: []
        });
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