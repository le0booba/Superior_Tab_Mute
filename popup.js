document.addEventListener('DOMContentLoaded', () => {
    const MANIFEST = chrome.runtime.getManifest();
    let LOCALES = { en: {}, ru: {} };
    let currentLanguage = 'en';

    const RESERVED_WORDS = new Set([
        'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'biz', 'info', 'name', 'pro',
        'aero', 'coop', 'museum', 'app', 'dev', 'io', 'ai', 'co', 'ru', 'en', 'uk',
        'us', 'de', 'fr', 'jp', 'cn', 'eu', 'www', 'mail', 'web', 'api', 'cdn', 'ftp',
        'ns', 'admin', 'blog', 'news', 'shop', 'store', 'test', 'local', 'localhost',
        'stream', 'player'
    ]);

    const DOM = {
        controlsWrapper: document.getElementById('controls-wrapper'),
        firstSoundControls: document.getElementById('first-sound-controls'),
        whitelistControls: document.getElementById('whitelist-controls'),
        muteNewControls: document.getElementById('mute-new-controls'),
        resetMuteNewBtn: document.getElementById('reset-mute-new-btn'),
        masterToggle: document.getElementById('master-toggle-switch'),
        muteAllToggle: document.getElementById('mute-all-toggle-switch'),
        setDefaultMuteAllBtn: document.getElementById('set-default-mute-all'),
        modeForm: document.getElementById('mode-form'),
        setSourceBtn: document.getElementById('set-source-btn'),
        clearSourceBtn: document.getElementById('clear-source-btn'),
        clearWhitelistBtn: document.getElementById('clear-whitelist-btn'),
        showAllTabsFirstSound: document.getElementById('show-all-tabs-first-sound'),
        showAllTabsWhitelist: document.getElementById('show-all-tabs-whitelist'),
        firstSoundTabsList: document.getElementById('first-sound-tabs-list'),
        audibleTabsList: document.getElementById('audible-tabs-list'),
        soundSourceDisplay: document.getElementById('current-sound-source-display'),
        langSwitcher: document.querySelector('.lang-switcher'),
        versionInfo: document.getElementById('version-info'),
        authorInfo: document.getElementById('author-info'),
        githubLink: document.getElementById('github-link'),
        rememberOptionWrapper: document.getElementById('remember-option-wrapper'),
        rememberLastTabToggle: document.getElementById('remember-last-tab-toggle'),
        expandSettingsBtn: document.getElementById('expand-settings-btn'),
        expandableContentFS: document.querySelector('#first-sound-controls .expandable-content'),
        editListsBtn: document.getElementById('edit-lists-btn'),
        closeListsBtn: document.getElementById('close-lists-btn'),
        listsPanel: document.querySelector('.lists-panel'),
        alwaysAllowTextarea: document.getElementById('always-allow-textarea'),
        alwaysBlockTextarea: document.getElementById('always-block-textarea'),
        clearAlwaysAllowBtn: document.getElementById('clear-always-allow-btn'),
        clearAlwaysBlockBtn: document.getElementById('clear-always-block-btn'),
        quickAllowBtn: document.getElementById('quick-allow-btn'),
        quickBlockBtn: document.getElementById('quick-block-btn'),
        excModeActive: document.getElementById('exc-mode-active'),
        excModeFirstSound: document.getElementById('exc-mode-first-sound'),
        excModeWhitelist: document.getElementById('exc-mode-whitelist'),
        excModeMuteNew: document.getElementById('exc-mode-mute-new'),
        saveListsBtn: document.getElementById('save-lists-btn'),
        listsValidationError: document.getElementById('lists-validation-error')
    };

    const STORAGE_KEYS = {
        sync: {
            mode: 'active',
            isExtensionEnabled: true,
            isAllMuted: false,
            rememberLastTab: false,
            defaultMode: null,
            defaultMuteAll: false,
            exceptionModes: ['active', 'first-sound', 'whitelist', 'mute-new']
        },
        session: { firstAudibleTabId: null, whitelistedTabId: null, expansionStates: {} },
        local: {
            showAllTabsFirstSound: false,
            showAllTabsWhitelist: false,
            stm_lang: chrome.i18n.getUILanguage().startsWith('ru') ? 'ru' : 'en',
            isListsOpen: false,
            alwaysAllowList: [],
            alwaysBlockList: []
        }
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
        pattern = pattern.toLowerCase().trim();
        if (!pattern) return false;

        if (pattern.startsWith('www.')) {
            pattern = pattern.slice(4);
        }
        if (pattern.startsWith('*.www.')) {
            pattern = '*.' + pattern.slice(6);
        }

        const isSingleWord = !pattern.includes('.') && !pattern.includes('*');
        if (isSingleWord) {
            if (pattern.length < 2 || RESERVED_WORDS.has(pattern)) {
                return false;
            }
            const nonTld = getNonTldHost(host);
            const labels = nonTld.split('.');
            return labels.includes(pattern);
        }

        if (pattern.startsWith('*.')) {
            const domain = pattern.slice(2);
            return host === domain || host.endsWith('.' + domain);
        }

        if (pattern.endsWith('.*')) {
            const domainPrefix = pattern.slice(0, -2);
            const nonTld = getNonTldHost(host);
            return nonTld === domainPrefix || nonTld.endsWith('.' + domainPrefix);
        }

        if (host === pattern || host.endsWith('.' + pattern)) {
            return true;
        }

        return false;
    };

    const matchesList = (hostOrUrl, list) => {
        if (!hostOrUrl || !list || !Array.isArray(list)) return false;
        let host = hostOrUrl;
        if (hostOrUrl.includes('://')) {
            try {
                host = new URL(hostOrUrl).hostname;
            } catch { }
        }
        return list.some(pattern => matchPattern(host, pattern));
    };

    const loadLocales = async () => {
        const loadLocale = async (lang) => {
            const response = await fetch(`_locales/${lang}/messages.json`);
            const data = await response.json();
            return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.message]));
        };
        [LOCALES.en, LOCALES.ru] = await Promise.all([loadLocale('en'), loadLocale('ru')]);
    };

    const getLocaleString = (key) => LOCALES[currentLanguage]?.[key] || LOCALES.en[key] || '';

    const fetchManageableTabs = async (query = {}) => {
        const tabs = await chrome.tabs.query(query);
        return tabs
            .filter(tab => tab?.id && tab.url && !/^(chrome|chrome-extension|edge):\/\//.test(tab.url) && !tab.url.startsWith('https://chromewebstore.google.com/'))
            .map(({ id, title, favIconUrl, audible, url }) => ({ id, title, favIconUrl, audible, url }));
    };

    const getCombinedSettings = async () => {
        try {
            const [sync, session, local] = await Promise.all([
                chrome.storage.sync.get(STORAGE_KEYS.sync),
                chrome.storage.session.get(STORAGE_KEYS.session),
                chrome.storage.local.get(STORAGE_KEYS.local)
            ]);
            return { ...sync, ...session, ...local };
        } catch {
            return { ...STORAGE_KEYS.sync, ...STORAGE_KEYS.session, ...STORAGE_KEYS.local };
        }
    };

    const applyLocalization = () => {
        document.querySelectorAll('[data-locale], [data-locale-title], [data-locale-placeholder]').forEach(el => {
            if (el.dataset.locale) el.innerHTML = getLocaleString(el.dataset.locale);
            if (el.dataset.localeTitle) el.title = getLocaleString(el.dataset.localeTitle);
            if (el.dataset.localePlaceholder) el.placeholder = getLocaleString(el.dataset.localePlaceholder);
        });
        DOM.versionInfo.innerHTML = `<strong>${MANIFEST.name}</strong> <span class="version-text">v${MANIFEST.version}</span>`;
        DOM.authorInfo.textContent = `${getLocaleString('by')} badrenton`;
        DOM.githubLink.textContent = getLocaleString('github');
    };

    const updateShortcutTooltips = async () => {
        const commands = await chrome.commands.getAll();
        for (const { name, shortcut } of commands) {
            if (name && shortcut) {
                const el = document.querySelector(`[data-command-name="${name}"]`);
                if (el) el.title = shortcut;
            }
        }
    };

    const createTabListItem = (tab, isSelected) => {
        const li = document.createElement('li');
        li.className = `tab-list-item${isSelected ? ' selected' : ''}`;
        li.dataset.tabId = tab.id;

        const img = document.createElement('img');
        img.className = 'tab-list-icon';
        img.src = tab.favIconUrl || 'icons/icon16.png';
        img.alt = '';

        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'tab-title-wrapper';

        const span = document.createElement('span');
        span.className = 'tab-list-title';
        span.title = tab.title || 'Untitled Tab';
        span.textContent = tab.title || 'Untitled Tab';

        titleWrapper.appendChild(span);
        li.appendChild(img);
        li.appendChild(titleWrapper);
        return li;
    };

    const renderTabsList = ({ container, tabs, selectedId }) => {
        container.textContent = '';
        if (tabs.length === 0) {
            const li = document.createElement('li');
            li.className = 'tab-list-item no-sound';
            li.textContent = getLocaleString('noTabs');
            container.appendChild(li);
            return;
        }
        const fragment = document.createDocumentFragment();
        tabs.forEach(tab => fragment.appendChild(createTabListItem(tab, tab.id === selectedId)));
        container.appendChild(fragment);
    };

    const updateFirstSoundDisplay = async (firstAudibleTabId) => {
        if (!firstAudibleTabId) {
            DOM.soundSourceDisplay.textContent = getLocaleString('noSoundSource');
            DOM.soundSourceDisplay.className = 'current-sound-source-display';
            return;
        }
        try {
            const tab = await chrome.tabs.get(firstAudibleTabId);
            DOM.soundSourceDisplay.textContent = '';
            DOM.soundSourceDisplay.className = 'current-sound-source-display active';

            const img = document.createElement('img');
            img.src = tab.favIconUrl || 'icons/icon16.png';
            img.className = 'tab-list-icon';
            img.alt = '';

            const span = document.createElement('span');
            span.className = 'source-display-title';
            const displayText = `${getLocaleString('sourcePrefix')} ${tab.title}`;
            span.textContent = displayText;
            DOM.soundSourceDisplay.title = displayText;

            DOM.soundSourceDisplay.appendChild(img);
            DOM.soundSourceDisplay.appendChild(span);
        } catch {
            await chrome.storage.session.remove('firstAudibleTabId');
            DOM.soundSourceDisplay.textContent = getLocaleString('noSoundSource');
            DOM.soundSourceDisplay.className = 'current-sound-source-display';
        }
    };

    const refreshTabLists = async (settings) => {
        if (!DOM.firstSoundControls.classList.contains('hidden') && !DOM.expandableContentFS.classList.contains('hidden')) {
            const { showAllTabsFirstSound } = await chrome.storage.local.get({ showAllTabsFirstSound: false });
            DOM.showAllTabsFirstSound.checked = showAllTabsFirstSound;
            const tabs = await fetchManageableTabs(showAllTabsFirstSound ? {} : { audible: true });
            renderTabsList({
                container: DOM.firstSoundTabsList,
                tabs,
                selectedId: settings.firstAudibleTabId
            });
        }
        if (!DOM.whitelistControls.classList.contains('hidden')) {
            const { showAllTabsWhitelist } = await chrome.storage.local.get({ showAllTabsWhitelist: false });
            DOM.showAllTabsWhitelist.checked = showAllTabsWhitelist;
            const tabsToList = await fetchManageableTabs(showAllTabsWhitelist ? {} : { audible: true });

            if (!showAllTabsWhitelist && settings.whitelistedTabId && !tabsToList.some(t => t.id === settings.whitelistedTabId)) {
                const whitelistedTab = await chrome.tabs.get(settings.whitelistedTabId).catch(() => null);
                if (whitelistedTab) tabsToList.unshift({ id: whitelistedTab.id, title: whitelistedTab.title, favIconUrl: whitelistedTab.favIconUrl, audible: whitelistedTab.audible, url: whitelistedTab.url });
                else chrome.storage.session.remove('whitelistedTabId');
            }
            renderTabsList({
                container: DOM.audibleTabsList,
                tabs: tabsToList,
                selectedId: settings.whitelistedTabId
            });
        }
    };

    const updateExpansionUI = (mode, state) => {
        const isFS = mode === 'first-sound';
        const isWL = mode === 'whitelist';
        DOM.expandableContentFS.classList.toggle('hidden', isFS && state < 1);
        DOM.rememberOptionWrapper.classList.toggle('hidden', (isFS && state < 2) || (isWL && state < 1));
        DOM.expandSettingsBtn.textContent = (isFS && state === 2) || (isWL && state > 0) ? '▲' : '▼';
    };

    const toCamelCase = (str) => str.replace(/-(\w)/g, (_, c) => c.toUpperCase());

    const updateControlSectionsVisibility = async (settings) => {
        const { mode, expansionStates } = settings;
        const isExpandableMode = mode === 'first-sound' || mode === 'whitelist';

        DOM.expandSettingsBtn.classList.toggle('hidden', !isExpandableMode);
        DOM.modeForm.classList.toggle('has-expandable-options', isExpandableMode);

        ['first-sound', 'whitelist', 'mute-new'].forEach(m => DOM[`${toCamelCase(m)}Controls`].classList.toggle('hidden', mode !== m));
        DOM.rememberOptionWrapper.classList.add('hidden');

        if (isExpandableMode) updateExpansionUI(mode, expansionStates[mode] || 0);
        if (mode === 'first-sound') await updateFirstSoundDisplay(settings.firstAudibleTabId);

        await refreshTabLists(settings);
    };

    const updateDefaultModeUI = (defaultMode) => {
        document.querySelectorAll('.set-default-btn[data-mode]').forEach(btn => {
            const isActive = btn.dataset.mode === defaultMode;
            btn.classList.toggle('active', isActive);
            btn.textContent = isActive ? '★' : '☆';
            btn.title = isActive ? getLocaleString('defaultMode') : getLocaleString('setAsDefault');
        });
    };

    const updateDefaultMuteAllUI = (defaultMuteAll) => {
        const isActive = defaultMuteAll === true;
        DOM.setDefaultMuteAllBtn.classList.toggle('active', isActive);
        DOM.setDefaultMuteAllBtn.textContent = isActive ? '★' : '☆';
        DOM.setDefaultMuteAllBtn.title = isActive ? getLocaleString('defaultIsOn') : getLocaleString('setDefaultToOn');
    };

    const updateQuickButtonsState = async (settings) => {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let host = null;
        if (activeTab?.url && !/^(chrome|chrome-extension|edge):\/\//.test(activeTab.url)) {
            try {
                host = new URL(activeTab.url).hostname.toLowerCase();
                if (host.startsWith('www.')) host = host.slice(4);
            } catch { }
        }

        if (host) {
            const isAllowed = matchesList(host, settings.alwaysAllowList);
            const isBlocked = matchesList(host, settings.alwaysBlockList);
            DOM.quickAllowBtn.classList.toggle('active', isAllowed);
            DOM.quickBlockBtn.classList.toggle('active', isBlocked);
        } else {
            DOM.quickAllowBtn.classList.remove('active');
            DOM.quickBlockBtn.classList.remove('active');
        }
    };

    const forcePopupResize = () => {
        const body = document.body;
        const root = document.documentElement;
        const currentWidth = body.classList.contains('lists-open') ? '500px' : '250px';
        root.style.width = currentWidth;
        root.style.minWidth = currentWidth;
        root.style.maxWidth = currentWidth;
        body.style.width = currentWidth;
        body.style.minWidth = currentWidth;
        body.style.maxWidth = currentWidth;
        body.style.display = 'none';
        void body.offsetHeight;
        body.style.display = '';
    };

    const updateAllUI = async (settings) => {
        DOM.masterToggle.checked = settings.isExtensionEnabled;
        DOM.muteAllToggle.checked = settings.isAllMuted;
        DOM.rememberLastTabToggle.checked = settings.rememberLastTab;
        DOM.controlsWrapper.classList.toggle('disabled', !settings.isExtensionEnabled);

        const modeRadio = document.querySelector(`input[name="mode"][value="${settings.mode}"]`);
        if (modeRadio) modeRadio.checked = true;

        updateDefaultModeUI(settings.defaultMode);
        updateDefaultMuteAllUI(settings.defaultMuteAll);
        await updateControlSectionsVisibility(settings);

        const wasListsOpen = document.body.classList.contains('lists-open');
        document.body.classList.toggle('lists-open', !!settings.isListsOpen);
        DOM.listsPanel.classList.toggle('hidden', !settings.isListsOpen);
        if (wasListsOpen !== !!settings.isListsOpen) {
            forcePopupResize();
        }

        if (document.activeElement !== DOM.alwaysAllowTextarea) {
            DOM.alwaysAllowTextarea.value = (settings.alwaysAllowList || []).join('\n');
            DOM.alwaysAllowTextarea.classList.remove('has-error');
        }
        if (document.activeElement !== DOM.alwaysBlockTextarea) {
            DOM.alwaysBlockTextarea.value = (settings.alwaysBlockList || []).join('\n');
            DOM.alwaysBlockTextarea.classList.remove('has-error');
        }

        DOM.listsValidationError.classList.add('hidden');
        DOM.listsValidationError.textContent = '';

        DOM.excModeActive.checked = (settings.exceptionModes || []).includes('active');
        DOM.excModeFirstSound.checked = (settings.exceptionModes || []).includes('first-sound');
        DOM.excModeWhitelist.checked = (settings.exceptionModes || []).includes('whitelist');
        DOM.excModeMuteNew.checked = (settings.exceptionModes || []).includes('mute-new');

        await updateQuickButtonsState(settings);
    };

    const handleStorageChange = async () => {
        const settings = await getCombinedSettings();
        await updateAllUI(settings);
    };

    const onLanguageSwitch = async (lang) => {
        if (currentLanguage === lang) return;
        currentLanguage = lang;
        await chrome.storage.local.set({ stm_lang: lang });

        document.getElementById('lang-en').classList.toggle('active', lang === 'en');
        document.getElementById('lang-ru').classList.toggle('active', lang === 'ru');

        applyLocalization();
        const settings = await getCombinedSettings();
        updateDefaultModeUI(settings.defaultMode);
        updateDefaultMuteAllUI(settings.defaultMuteAll);
        await updateControlSectionsVisibility(settings);
    };

    const onSetDefaultMode = async (e) => {
        const btn = e.target.closest('.set-default-btn');
        if (!btn?.dataset.mode) return;
        const clickedMode = btn.dataset.mode;
        const { defaultMode } = await chrome.storage.sync.get('defaultMode');
        chrome.storage.sync.set({ defaultMode: defaultMode === clickedMode ? null : clickedMode });
    };

    const onSetDefaultMuteAll = async () => {
        const { defaultMuteAll } = await chrome.storage.sync.get({ defaultMuteAll: false });
        chrome.storage.sync.set({ defaultMuteAll: !defaultMuteAll });
    };

    const onExpandSettings = async () => {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const { expansionStates = {} } = await chrome.storage.session.get({ expansionStates: {} });
        expansionStates[mode] = ((expansionStates[mode] || 0) + 1) % (mode === 'whitelist' ? 2 : 3);
        await chrome.storage.session.set({ expansionStates });
    };

    const onResetMuteNew = () => {
        if (DOM.resetMuteNewBtn.classList.contains('success')) return;
        chrome.runtime.sendMessage({ action: 'resetMuteNew' });
        const originalText = DOM.resetMuteNewBtn.innerHTML;
        DOM.resetMuteNewBtn.innerHTML = getLocaleString('resetSuccess');
        DOM.resetMuteNewBtn.classList.add('success');
        setTimeout(() => {
            DOM.resetMuteNewBtn.innerHTML = originalText;
            DOM.resetMuteNewBtn.classList.remove('success');
        }, 1500);
    };

    const onSetSource = async () => {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id && !/^(chrome|chrome-extension|edge):\/\//.test(activeTab.url)) {
            chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
        }
    };

    const onTabListClick = (e, key) => {
        const li = e.target.closest('.tab-list-item:not(.no-sound)');
        if (li?.dataset.tabId) chrome.storage.session.set({ [key]: parseInt(li.dataset.tabId, 10) });
    };

    const onShowAllChange = async (e, storageKey) => {
        await chrome.storage.local.set({ [storageKey]: e.target.checked });
        const settings = await getCombinedSettings();
        await refreshTabLists(settings);
    };

    const sanitizeUrlCandidate = (raw) => {
        let pattern = raw.trim().toLowerCase();
        if (!pattern) return '';
        if (pattern.includes('://')) {
            pattern = pattern.split('://')[1];
        }
        pattern = pattern.split(/[/?#]/)[0];
        if (pattern.startsWith('www.')) {
            pattern = pattern.slice(4);
        }
        if (pattern.startsWith('*.www.')) {
            pattern = '*.' + pattern.slice(6);
        }
        return pattern;
    };

    const validatePattern = (pattern) => {
        if (!pattern) return { valid: false };

        const singleWordRegex = /^[\p{L}\p{N}-]+$/u;
        if (singleWordRegex.test(pattern)) {
            if (pattern.length < 2 || RESERVED_WORDS.has(pattern)) {
                return { valid: false, reason: 'reserved' };
            }
            return { valid: true, pattern };
        }

        const domainWildcardRegex = /^(\*\.)?[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;
        if (domainWildcardRegex.test(pattern)) {
            return { valid: true, pattern };
        }

        const tldWildcardRegex = /^([\p{L}\p{N}-]+\.)+\*$/u;
        if (tldWildcardRegex.test(pattern)) {
            return { valid: true, pattern };
        }

        return { valid: false, reason: 'invalid' };
    };

    const parseAndValidateText = (text) => {
        const lines = text.replace(/,/g, '\n').split('\n');
        const validList = [];
        const invalidLines = [];

        lines.forEach(rawLine => {
            const trimmed = rawLine.trim();
            if (!trimmed) return;
            const cleaned = sanitizeUrlCandidate(trimmed);
            const result = validatePattern(cleaned);
            if (result.valid) {
                if (!validList.includes(result.pattern)) {
                    validList.push(result.pattern);
                }
            } else {
                invalidLines.push(trimmed);
            }
        });

        return { validList, invalidLines };
    };

    const onSaveExceptions = () => {
        const allowParsed = parseAndValidateText(DOM.alwaysAllowTextarea.value);
        const blockParsed = parseAndValidateText(DOM.alwaysBlockTextarea.value);

        DOM.alwaysAllowTextarea.classList.toggle('has-error', allowParsed.invalidLines.length > 0);
        DOM.alwaysBlockTextarea.classList.toggle('has-error', blockParsed.invalidLines.length > 0);

        const allInvalid = [...allowParsed.invalidLines, ...blockParsed.invalidLines];
        if (allInvalid.length > 0) {
            const errorTemplate = getLocaleString('validationError');
            DOM.listsValidationError.textContent = `${errorTemplate}: ${allInvalid.slice(0, 3).join(', ')}${allInvalid.length > 3 ? '...' : ''}`;
            DOM.listsValidationError.classList.remove('hidden');
            return;
        }

        DOM.listsValidationError.classList.add('hidden');
        DOM.listsValidationError.textContent = '';

        DOM.alwaysAllowTextarea.value = allowParsed.validList.join('\n');
        DOM.alwaysBlockTextarea.value = blockParsed.validList.join('\n');

        const modes = [];
        if (DOM.excModeActive.checked) modes.push('active');
        if (DOM.excModeFirstSound.checked) modes.push('first-sound');
        if (DOM.excModeWhitelist.checked) modes.push('whitelist');
        if (DOM.excModeMuteNew.checked) modes.push('mute-new');

        Promise.all([
            chrome.storage.local.set({
                alwaysAllowList: allowParsed.validList,
                alwaysBlockList: blockParsed.validList
            }),
            chrome.storage.sync.set({
                exceptionModes: modes
            })
        ]).then(() => {
            const originalText = DOM.saveListsBtn.innerHTML;
            DOM.saveListsBtn.innerHTML = getLocaleString('resetSuccess');
            DOM.saveListsBtn.classList.add('success');
            setTimeout(() => {
                DOM.saveListsBtn.innerHTML = originalText;
                DOM.saveListsBtn.classList.remove('success');
            }, 1500);
        });
    };

    const saveExceptionModes = () => {
        const modes = [];
        if (DOM.excModeActive.checked) modes.push('active');
        if (DOM.excModeFirstSound.checked) modes.push('first-sound');
        if (DOM.excModeWhitelist.checked) modes.push('whitelist');
        if (DOM.excModeMuteNew.checked) modes.push('mute-new');
        chrome.storage.sync.set({ exceptionModes: modes });
    };

    const onQuickException = async (listKey) => {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.url || /^(chrome|chrome-extension|edge):\/\//.test(activeTab.url)) return;
        let host;
        try {
            host = new URL(activeTab.url).hostname.toLowerCase();
        } catch { return; }
        if (host.startsWith('www.')) host = host.slice(4);
        if (!host) return;

        const oppositeKey = listKey === 'alwaysAllowList' ? 'alwaysBlockList' : 'alwaysAllowList';
        const data = await chrome.storage.local.get({ [listKey]: [], [oppositeKey]: [] });
        let targetList = data[listKey] || [];
        let oppositeList = data[oppositeKey] || [];

        const isCurrentlyMatched = matchesList(host, targetList);

        if (isCurrentlyMatched) {
            targetList = targetList.filter(pattern => !matchPattern(host, pattern));
        } else {
            targetList.push(host);
            oppositeList = oppositeList.filter(pattern => !matchPattern(host, pattern));
        }

        await chrome.storage.local.set({
            [listKey]: targetList,
            [oppositeKey]: oppositeList
        });

        DOM.alwaysAllowTextarea.value = (listKey === 'alwaysAllowList' ? targetList : oppositeList).join('\n');
        DOM.alwaysBlockTextarea.value = (listKey === 'alwaysBlockList' ? targetList : oppositeList).join('\n');
    };

    const bindEventListeners = () => {
        DOM.masterToggle.addEventListener('change', e => chrome.storage.sync.set({ isExtensionEnabled: e.target.checked }));
        DOM.muteAllToggle.addEventListener('change', e => chrome.storage.sync.set({ isAllMuted: e.target.checked }));
        DOM.modeForm.addEventListener('change', e => { if (e.target.name === 'mode') chrome.storage.sync.set({ mode: e.target.value }); });
        DOM.rememberLastTabToggle.addEventListener('change', e => chrome.storage.sync.set({ rememberLastTab: e.target.checked }));
        DOM.setSourceBtn.addEventListener('click', onSetSource);
        DOM.clearSourceBtn.addEventListener('click', () => chrome.storage.session.set({ firstAudibleTabId: null }));
        DOM.clearWhitelistBtn.addEventListener('click', () => chrome.storage.session.set({ whitelistedTabId: null }));
        DOM.firstSoundTabsList.addEventListener('click', e => onTabListClick(e, 'firstAudibleTabId'));
        DOM.audibleTabsList.addEventListener('click', e => onTabListClick(e, 'whitelistedTabId'));
        DOM.showAllTabsFirstSound.addEventListener('change', e => onShowAllChange(e, 'showAllTabsFirstSound'));
        DOM.showAllTabsWhitelist.addEventListener('change', e => onShowAllChange(e, 'showAllTabsWhitelist'));
        DOM.langSwitcher.addEventListener('click', e => {
            const lang = e.target.closest('.lang-btn')?.id.split('-')[1];
            if (lang) onLanguageSwitch(lang);
        });
        DOM.resetMuteNewBtn.addEventListener('click', onResetMuteNew);
        DOM.expandSettingsBtn.addEventListener('click', onExpandSettings);
        DOM.controlsWrapper.addEventListener('click', e => {
            if (e.target.classList.contains('set-default-btn')) {
                e.target.id === 'set-default-mute-all' ? onSetDefaultMuteAll() : onSetDefaultMode(e);
            }
        });
        DOM.editListsBtn.addEventListener('click', async () => {
            const { isListsOpen } = await chrome.storage.local.get({ isListsOpen: false });
            await chrome.storage.local.set({ isListsOpen: !isListsOpen });
        });
        DOM.quickAllowBtn.addEventListener('click', () => onQuickException('alwaysAllowList'));
        DOM.quickBlockBtn.addEventListener('click', () => onQuickException('alwaysBlockList'));
        DOM.closeListsBtn.addEventListener('click', async () => {
            await chrome.storage.local.set({ isListsOpen: false });
        });
        DOM.saveListsBtn.addEventListener('click', onSaveExceptions);
        DOM.clearAlwaysAllowBtn.addEventListener('click', () => {
            DOM.alwaysAllowTextarea.value = '';
            DOM.alwaysAllowTextarea.classList.remove('has-error');
            DOM.listsValidationError.classList.add('hidden');
        });
        DOM.clearAlwaysBlockBtn.addEventListener('click', () => {
            DOM.alwaysBlockTextarea.value = '';
            DOM.alwaysBlockTextarea.classList.remove('has-error');
            DOM.listsValidationError.classList.add('hidden');
        });
        DOM.alwaysAllowTextarea.addEventListener('input', () => {
            DOM.alwaysAllowTextarea.classList.remove('has-error');
            DOM.listsValidationError.classList.add('hidden');
        });
        DOM.alwaysBlockTextarea.addEventListener('input', () => {
            DOM.alwaysBlockTextarea.classList.remove('has-error');
            DOM.listsValidationError.classList.add('hidden');
        });
        DOM.excModeActive.addEventListener('change', saveExceptionModes);
        DOM.excModeFirstSound.addEventListener('change', saveExceptionModes);
        DOM.excModeWhitelist.addEventListener('change', saveExceptionModes);
        DOM.excModeMuteNew.addEventListener('change', saveExceptionModes);
        chrome.storage.onChanged.addListener(handleStorageChange);
    };

    const initialize = async () => {
        await loadLocales();
        const settings = await getCombinedSettings();
        currentLanguage = settings.stm_lang;
        document.getElementById('lang-en').classList.toggle('active', currentLanguage === 'en');
        document.getElementById('lang-ru').classList.toggle('active', currentLanguage === 'ru');
        applyLocalization();

        settings.isListsOpen = false;
        await chrome.storage.local.set({ isListsOpen: false });

        await updateAllUI(settings);
        await updateShortcutTooltips();
        bindEventListeners();
        document.body.style.opacity = 1;
    };

    initialize();
});