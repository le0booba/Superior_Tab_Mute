document.addEventListener('DOMContentLoaded', () => {
    const MANIFEST = chrome.runtime.getManifest();
    const LOCALES = {
        en: {
            muteAll: '🔇 Mute All Tabs',
            modeActive: 'Mute all except <b>active tab</b>',
            modeFirstSound: 'Mute all except <b>first tab</b> with sound',
            modeWhitelist: 'Mute all except a <b>specific tab</b>',
            modeMuteNew: 'Mute all <b>newly opened</b> tabs',
            selectTabToUnmute: 'Select a Tab to Unmute:',
            showAllTabs: 'Show all tabs',
            refreshSource: 'Current Tab ➜ 🔊',
            noTabs: 'No manageable tabs found.',
            noSoundSource: 'No sound source designated.',
            sourceClosed: 'Source tab has been closed.',
            sourcePrefix: 'SOURCE:',
            by: 'by',
            github: 'GitHub',
            rememberLastTab: 'Remember last source',
            rememberLastTabDesc: 'If the source tab goes silent, auto-switch to the last audible tab.',
            resetMuteNew: '🗔 Reset Mute on All Tabs',
            resetSuccess: '✔',
            clearSource: 'Clear sound source',
            expandOptionsTooltip: 'Show/hide additional options'
        },
        ru: {
            muteAll: '🔇 Заглушить все',
            modeActive: 'Заглушить все, кроме <b>активной</b>',
            modeFirstSound: 'Заглуш. все, кроме <b>1ой со звуком</b>',
            modeWhitelist: 'Заглушить все, кроме <b>выбранной</b>',
            modeMuteNew: 'Заглушать все <b>новые</b> вкладки',
            selectTabToUnmute: 'Выберите вкладку для звука:',
            showAllTabs: 'Показать все вкладки',
            refreshSource: 'Текущая вкладка ➜ 🔊',
            noTabs: 'Вкладки не найдены.',
            noSoundSource: 'Источник звука не назначен.',
            sourceClosed: 'Вкладка-источник закрыта.',
            sourcePrefix: 'ИСТОЧНИК:',
            github: 'GitHub',
            rememberLastTab: 'Помнить источник',
            rememberLastTabDesc: 'Если источник затихнет, автоматически переключиться на последнюю вкладку со звуком.',
            resetMuteNew: '🗔 Сбросить обеззвучивание',
            resetSuccess: '✔',
            clearSource: 'Очистить источник звука',
            expandOptionsTooltip: 'Показать/скрыть дополнительные опции'
        }
    };
    let currentLanguage = 'en';
    let popupTabsData = [];
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
    };
    const getLocaleString = (key) => LOCALES[currentLanguage]?.[key] || LOCALES.en[key];
    const getCombinedSettings = async () => {
        const [sync, session, local] = await Promise.all([
            chrome.storage.sync.get({
                mode: 'active',
                isExtensionEnabled: true,
                isAllMuted: false,
                rememberLastTab: false,
                defaultMode: null,
                defaultMuteAll: false
            }),
            chrome.storage.session.get({
                firstAudibleTabId: null,
                whitelistedTabId: null,
                popupTabsData: [],
                expansionStates: {}
            }),
            chrome.storage.local.get({
                stm_lang: 'en'
            })
        ]);
        return { ...sync,
            ...session,
            ...local
        };
    };
    const applyLocalization = () => {
        document.querySelectorAll('[data-locale], [data-locale-title]').forEach(el => {
            if (el.dataset.locale) el.innerHTML = getLocaleString(el.dataset.locale);
            if (el.dataset.localeTitle) el.title = getLocaleString(el.dataset.localeTitle);
        });
        DOM.versionInfo.innerHTML = `<strong>${
            MANIFEST.name
        }</strong> <span class="version-text">v${
            MANIFEST.version
        }</span>`;
        DOM.authorInfo.textContent = `${
            getLocaleString('by')
        } badrenton`;
        DOM.githubLink.textContent = getLocaleString('github');
    };
    const updateShortcutTooltips = async () => {
        const commands = await chrome.commands.getAll();
        commands.forEach(command => {
            if (command.name && command.shortcut) {
                const el = document.querySelector(`[data-command-name="${
                    command.name
                }"]`);
                if (el) el.title = command.shortcut;
            }
        });
    };
    const createTabListItem = (tab, isSelected) => {
        const li = document.createElement('li');
        li.className = 'tab-list-item';
        li.dataset.tabId = tab.id;
        li.classList.toggle('selected', isSelected);
        const img = document.createElement('img');
        img.className = 'tab-list-icon';
        img.src = tab.favIconUrl || 'icons/icon16.png';
        img.alt = '';
        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'tab-title-wrapper';
        const span = document.createElement('span');
        span.className = 'tab-list-title';
        const titleText = tab.title || 'Untitled Tab';
        span.title = titleText;
        span.textContent = titleText;
        titleWrapper.appendChild(span);
        li.appendChild(img);
        li.appendChild(titleWrapper);
        return li;
    };
    const renderTabsList = ({
        container,
        tabs,
        selectedId
    }) => {
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
            span.textContent = `${
                getLocaleString('sourcePrefix')
            } ${
                tab.title
            }`;
            DOM.soundSourceDisplay.title = `${
                getLocaleString('sourcePrefix')
            } ${
                tab.title
            }`;
            DOM.soundSourceDisplay.appendChild(img);
            DOM.soundSourceDisplay.appendChild(span);
        } catch (error) {
            DOM.soundSourceDisplay.textContent = getLocaleString('sourceClosed');
            DOM.soundSourceDisplay.className = 'current-sound-source-display error';
        }
    };
    const refreshTabLists = async (settings) => {
        const allowedTabs = popupTabsData.filter(t => !t.url || !t.url.startsWith('https://chromewebstore.google.com/'));
        if (!DOM.firstSoundControls.classList.contains('hidden') && !DOM.expandableContentFS.classList.contains('hidden')) {
            const {
                showAllTabsFirstSound: showAll
            } = await chrome.storage.local.get({
                showAllTabsFirstSound: false
            });
            DOM.showAllTabsFirstSound.checked = showAll;
            const tabsToList = showAll ? allowedTabs : allowedTabs.filter(t => t.audible);
            renderTabsList({
                container: DOM.firstSoundTabsList,
                tabs: tabsToList,
                selectedId: settings.firstAudibleTabId
            });
        }
        if (!DOM.whitelistControls.classList.contains('hidden')) {
            const {
                showAllTabsWhitelist: showAll
            } = await chrome.storage.local.get({
                showAllTabsWhitelist: false
            });
            DOM.showAllTabsWhitelist.checked = showAll;
            let tabsToList = showAll ? allowedTabs : allowedTabs.filter(t => t.audible);
            if (!showAll && settings.whitelistedTabId && !tabsToList.some(t => t.id === settings.whitelistedTabId)) {
                const whitelistedTabDetails = popupTabsData.find(t => t.id === settings.whitelistedTabId);
                if (whitelistedTabDetails) tabsToList.unshift(whitelistedTabDetails);
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
        const isFullyExpanded = (isFS && state === 2) || (isWL && state > 0);
        DOM.expandSettingsBtn.textContent = isFullyExpanded ? '▲' : '▼';
    };
    const toCamelCase = (str) => str.replace(/-(\w)/g, (_, c) => c.toUpperCase());
    const updateControlSectionsVisibility = async (settings) => {
        const {
            mode,
            expansionStates
        } = settings;
        const isExpandableMode = mode === 'first-sound' || mode === 'whitelist';
        DOM.expandSettingsBtn.classList.toggle('hidden', !isExpandableMode);
        DOM.modeForm.classList.toggle('has-expandable-options', isExpandableMode);
        ['first-sound', 'whitelist', 'mute-new'].forEach(m => {
            const key = `${toCamelCase(m)}Controls`;
            DOM[key].classList.toggle('hidden', mode !== m);
        });
        DOM.rememberOptionWrapper.classList.add('hidden');
        if (isExpandableMode) {
            updateExpansionUI(mode, expansionStates[mode] || 0);
        }
        if (mode === 'first-sound') {
            await updateFirstSoundDisplay(settings.firstAudibleTabId);
        }
        await refreshTabLists(settings);
    };
    const updateDefaultModeUI = (defaultMode) => {
        document.querySelectorAll('.set-default-btn[data-mode]').forEach(btn => {
            const isActive = btn.dataset.mode === defaultMode;
            btn.classList.toggle('active', isActive);
            btn.textContent = isActive ? '★' : '☆';
            btn.title = isActive ? 'Default mode' : 'Set as default';
        });
    };
    const updateDefaultMuteAllUI = (defaultMuteAll) => {
        const btn = DOM.setDefaultMuteAllBtn;
        const isActive = defaultMuteAll === true;
        btn.classList.toggle('active', isActive);
        btn.textContent = isActive ? '★' : '☆';
        btn.title = isActive ? 'Default is ON' : 'Set default to ON';
    };
    const updateAllUI = async (settings) => {
        DOM.masterToggle.checked = settings.isExtensionEnabled;
        DOM.muteAllToggle.checked = settings.isAllMuted;
        DOM.rememberLastTabToggle.checked = settings.rememberLastTab;
        DOM.controlsWrapper.classList.toggle('disabled', !settings.isExtensionEnabled);
        document.querySelector(`input[name="mode"][value="${
            settings.mode
        }"]`).checked = true;
        updateDefaultModeUI(settings.defaultMode);
        updateDefaultMuteAllUI(settings.defaultMuteAll);
        await updateControlSectionsVisibility(settings);
    };
    const handleStorageChange = async (changes) => {
        if (changes.popupTabsData) {
            popupTabsData = changes.popupTabsData.newValue || [];
        }
        const settings = await getCombinedSettings();
        await updateAllUI(settings);
    };
    const onLanguageSwitch = async (lang) => {
        if (currentLanguage === lang) return;
        currentLanguage = lang;
        await chrome.storage.local.set({
            stm_lang: lang
        });
        document.getElementById('lang-en').classList.toggle('active', lang === 'en');
        document.getElementById('lang-ru').classList.toggle('active', lang === 'ru');
        applyLocalization();
        const settings = await getCombinedSettings();
        await updateControlSectionsVisibility(settings);
    };
    const onSetDefaultMode = async (e) => {
        if (!e.target.classList.contains('set-default-btn')) return;
        const clickedMode = e.target.dataset.mode;
        const {
            defaultMode
        } = await chrome.storage.sync.get('defaultMode');
        chrome.storage.sync.set({
            defaultMode: defaultMode === clickedMode ? null : clickedMode
        });
    };
    const onSetDefaultMuteAll = async () => {
        const {
            defaultMuteAll
        } = await chrome.storage.sync.get({
            defaultMuteAll: false
        });
        chrome.storage.sync.set({
            defaultMuteAll: !defaultMuteAll
        });
    };
    const onExpandSettings = async () => {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        let {
            expansionStates = {}
        } = await chrome.storage.session.get({
            expansionStates: {}
        });
        let currentState = expansionStates[mode] || 0;
        const maxState = mode === 'whitelist' ? 2 : 3;
        currentState = (currentState + 1) % maxState;
        expansionStates[mode] = currentState;
        await chrome.storage.session.set({
            expansionStates
        });
    };
    const onResetMuteNew = () => {
        if (DOM.resetMuteNewBtn.classList.contains('success')) return;
        chrome.runtime.sendMessage({
            action: 'resetMuteNew'
        });
        const originalText = DOM.resetMuteNewBtn.innerHTML;
        DOM.resetMuteNewBtn.innerHTML = getLocaleString('resetSuccess');
        DOM.resetMuteNewBtn.classList.add('success');
        setTimeout(() => {
            DOM.resetMuteNewBtn.innerHTML = originalText;
            DOM.resetMuteNewBtn.classList.remove('success');
        }, 1500);
    };
    const onSetSource = async () => {
        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        if (activeTab?.id && !activeTab.url.startsWith('chrome://') && !activeTab.url.startsWith('chrome-extension://')) {
            chrome.storage.session.set({
                firstAudibleTabId: activeTab.id
            });
        }
    };
    const onTabListClick = (e, key) => {
        const li = e.target.closest('.tab-list-item:not(.no-sound)');
        if (li?.dataset.tabId) {
            chrome.storage.session.set({
                [key]: parseInt(li.dataset.tabId, 10)
            });
        }
    };
    const onShowAllChange = async (e, storageKey) => {
        await chrome.storage.local.set({
            [storageKey]: e.target.checked
        });
        const settings = await getCombinedSettings();
        await refreshTabLists(settings);
    };
    const bindEventListeners = () => {
        DOM.masterToggle.addEventListener('change', e => chrome.storage.sync.set({
            isExtensionEnabled: e.target.checked
        }));
        DOM.muteAllToggle.addEventListener('change', e => chrome.storage.sync.set({
            isAllMuted: e.target.checked
        }));
        DOM.modeForm.addEventListener('change', e => {
            if (e.target.name === 'mode') chrome.storage.sync.set({
                mode: e.target.value
            });
        });
        DOM.rememberLastTabToggle.addEventListener('change', e => chrome.storage.sync.set({
            rememberLastTab: e.target.checked
        }));
        DOM.setSourceBtn.addEventListener('click', onSetSource);
        DOM.clearSourceBtn.addEventListener('click', () => chrome.storage.session.set({
            firstAudibleTabId: null
        }));
        DOM.clearWhitelistBtn.addEventListener('click', () => chrome.storage.session.set({
            whitelistedTabId: null
        }));
        DOM.firstSoundTabsList.addEventListener('click', e => onTabListClick(e, 'firstAudibleTabId'));
        DOM.audibleTabsList.addEventListener('click', e => onTabListClick(e, 'whitelistedTabId'));
        DOM.showAllTabsFirstSound.addEventListener('change', e => onShowAllChange(e, 'showAllTabsFirstSound'));
        DOM.showAllTabsWhitelist.addEventListener('change', e => onShowAllChange(e, 'showAllTabsWhitelist'));
        DOM.langSwitcher.addEventListener('click', e => {
            const lang = e.target.closest('.lang-btn')?.id.split('-')[1];
            if (lang) onLanguageSwitch(lang);
        });
        DOM.resetMuteNewBtn.addEventListener('click', onResetMuteNew);
        DOM.modeForm.addEventListener('click', onSetDefaultMode);
        DOM.setDefaultMuteAllBtn.addEventListener('click', onSetDefaultMuteAll);
        DOM.expandSettingsBtn.addEventListener('click', onExpandSettings);
        chrome.storage.onChanged.addListener(handleStorageChange);
    };
    const initialize = async () => {
        const settings = await getCombinedSettings();
        currentLanguage = settings.stm_lang;
        popupTabsData = settings.popupTabsData;
        document.getElementById('lang-en').classList.toggle('active', currentLanguage === 'en');
        document.getElementById('lang-ru').classList.toggle('active', currentLanguage === 'ru');
        applyLocalization();
        await updateAllUI(settings);
        await updateShortcutTooltips();
        bindEventListeners();
        document.body.style.opacity = 1;
    };
    initialize();
});