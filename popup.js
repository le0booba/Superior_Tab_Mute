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
            refreshSource: '🔊 Current Tab 🠆 SOURCE',
            noTabs: 'No manageable tabs found.',
            noSoundSource: 'No sound source designated.',
            sourceClosed: 'Source tab has been closed.',
            sourcePrefix: 'SOURCE:',
            by: 'by',
            github: 'Page on GitHub',
            rememberLastTab: 'Remember last source',
            rememberLastTabDesc: 'If the source tab goes silent, auto-switch to the last audible tab.'
        },
        ru: {
            muteAll: '🔇 Заглушить все',
            modeActive: 'Заглушить все, кроме <b>активной</b>',
            modeFirstSound: 'Заглушить все, кроме <b>1ой со звуком</b>',
            modeWhitelist: 'Заглушить все, кроме <b>выбранной</b>',
            modeMuteNew: 'Заглушать все <b>новые</b> вкладки',
            selectTabToUnmute: 'Выберите вкладку для звука:',
            showAllTabs: 'Показать все вкладки',
            refreshSource: '🔊 Текущая вкладка 🠆 ИСТОЧНИК',
            noTabs: 'Вкладки не найдены.',
            noSoundSource: 'Источник звука не назначен.',
            sourceClosed: 'Вкладка-источник закрыта.',
            sourcePrefix: 'ИСТОЧНИК:',
            github: 'Страница на GitHub',
            rememberLastTab: 'Помнить источник',
            rememberLastTabDesc: 'Если источник затихнет, автоматически переключиться на последнюю вкладку со звуком.'
        }
    };
    let currentLanguage = localStorage.getItem('stm_lang') || 'en';

    const DOM = {
        controlsWrapper: document.getElementById('controls-wrapper'),
        firstSoundControls: document.getElementById('first-sound-controls'),
        whitelistControls: document.getElementById('whitelist-controls'),
        masterToggle: document.getElementById('master-toggle-switch'),
        muteAllToggle: document.getElementById('mute-all-toggle-switch'),
        modeForm: document.getElementById('mode-form'),
        refreshSourceBtn: document.getElementById('refresh-first-sound-btn'),
        showAllTabsFirstSound: document.getElementById('show-all-tabs-first-sound'),
        showAllTabsWhitelist: document.getElementById('show-all-tabs-whitelist'),
        firstSoundTabsList: document.getElementById('first-sound-tabs-list'),
        audibleTabsList: document.getElementById('audible-tabs-list'),
        soundSourceDisplay: document.getElementById('current-sound-source-display'),
        langEnBtn: document.getElementById('lang-en'),
        langRuBtn: document.getElementById('lang-ru'),
        versionInfo: document.getElementById('version-info'),
        authorInfo: document.getElementById('author-info'),
        githubLink: document.getElementById('github-link'),
        rememberOptionWrapper: document.getElementById('remember-option-wrapper'),
        rememberLastTabToggle: document.getElementById('remember-last-tab-toggle'),
    };

    const getLocaleString = (key) => LOCALES[currentLanguage][key] || LOCALES.en[key];

    const applyLocalization = () => {
        document.querySelectorAll('[data-locale]').forEach(el => {
            el.innerHTML = getLocaleString(el.dataset.locale);
        });
        document.querySelectorAll('[data-locale-title]').forEach(el => {
            el.title = getLocaleString(el.dataset.localeTitle);
        });
        DOM.versionInfo.innerHTML = `<strong>${MANIFEST.name}</strong> <span class="version-text">v${MANIFEST.version}</span>`;
        DOM.authorInfo.textContent = `${getLocaleString('by')} badrenton`;
        DOM.githubLink.textContent = getLocaleString('github');
    };
    
    const updateShortcutTooltips = async () => {
        const commands = await chrome.commands.getAll();
        commands.forEach(command => {
            if (command.name && command.shortcut) {
                const el = document.querySelector(`[data-command-name="${command.name}"]`);
                if (el) {
                    el.title = command.shortcut;
                }
            }
        });
    };

    const renderTabsList = ({ container, tabs, selectedId }) => {
        container.innerHTML = '';
        if (tabs.length === 0) {
            const li = document.createElement('li');
            li.className = 'tab-list-item no-sound';
            li.textContent = getLocaleString('noTabs');
            container.appendChild(li);
            return;
        }

        const fragment = document.createDocumentFragment();
        tabs.forEach(tab => {
            const li = document.createElement('li');
            li.className = 'tab-list-item';
            li.dataset.tabId = tab.id;
            if (tab.id === selectedId) li.classList.add('selected');

            const img = document.createElement('img');
            img.className = 'tab-list-icon';
            img.src = tab.favIconUrl || 'icons/icon16.png';
            img.alt = '';
            
            const titleWrapper = document.createElement('div');
            titleWrapper.className = 'tab-title-wrapper';

            const span = document.createElement('span');
            span.className = 'tab-list-title';
            span.textContent = tab.title || 'Untitled Tab';
            span.title = tab.title || 'Untitled Tab';

            titleWrapper.appendChild(span);
            li.append(img, titleWrapper);

            fragment.appendChild(li);
        });
        container.appendChild(fragment);
    };

    const populateTabList = async ({ listElem, showAllCheckbox, storageKey, showAllKey, onSelect, selectedId }) => {
        const showAll = localStorage.getItem(showAllKey) === 'true';
        showAllCheckbox.checked = showAll;

        const query = showAll ? {} : { audible: true };
        const tabs = (await chrome.tabs.query(query)).filter(t => t.id && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));

        listElem.onclick = (e) => {
            const li = e.target.closest('.tab-list-item:not(.no-sound)');
            if (li?.dataset.tabId) onSelect(parseInt(li.dataset.tabId, 10));
        };

        renderTabsList({ container: listElem, tabs, selectedId });
    };

    const updateFirstSoundDisplay = async (firstAudibleTabId) => {
        DOM.soundSourceDisplay.className = 'current-sound-source-display';

        if (!firstAudibleTabId) {
            DOM.soundSourceDisplay.textContent = getLocaleString('noSoundSource');
            return;
        }

        try {
            const tab = await chrome.tabs.get(firstAudibleTabId);
            DOM.soundSourceDisplay.innerHTML = `<img src="${tab.favIconUrl || 'icons/icon16.png'}" class="tab-list-icon" alt=""><span class="source-display-title">${getLocaleString('sourcePrefix')} ${tab.title}</span>`;
            DOM.soundSourceDisplay.title = `${getLocaleString('sourcePrefix')} ${tab.title}`;
            DOM.soundSourceDisplay.classList.add('active');
        } catch (error) {
            DOM.soundSourceDisplay.textContent = getLocaleString('sourceClosed');
            DOM.soundSourceDisplay.classList.add('error');
        }
    };
    
    const refreshFirstSoundList = (firstAudibleTabId) => populateTabList({
        listElem: DOM.firstSoundTabsList,
        showAllCheckbox: DOM.showAllTabsFirstSound,
        storageKey: 'firstAudibleTabId',
        showAllKey: 'showAllTabsFirstSound',
        onSelect: tabId => chrome.storage.session.set({ firstAudibleTabId: tabId }),
        selectedId: firstAudibleTabId
    });

    const refreshWhitelist = (whitelistedTabId) => populateTabList({
        listElem: DOM.audibleTabsList,
        showAllCheckbox: DOM.showAllTabsWhitelist,
        storageKey: 'whitelistedTabId',
        showAllKey: 'showAllTabsWhitelist',
        onSelect: tabId => chrome.storage.session.set({ whitelistedTabId: tabId }),
        selectedId: whitelistedTabId
    });

    const updateControlSectionsVisibility = (mode, settings) => {
        const showRememberOption = mode === 'first-sound' || mode === 'whitelist';
        DOM.rememberOptionWrapper.classList.toggle('hidden', !showRememberOption);
        
        DOM.firstSoundControls.classList.toggle('hidden', mode !== 'first-sound');
        DOM.whitelistControls.classList.toggle('hidden', mode !== 'whitelist');

        if (mode === 'first-sound') {
            updateFirstSoundDisplay(settings.firstAudibleTabId);
            refreshFirstSoundList(settings.firstAudibleTabId);
        } else if (mode === 'whitelist') {
            refreshWhitelist(settings.whitelistedTabId);
        }
    };

    const switchLanguage = (lang) => {
        currentLanguage = lang;
        localStorage.setItem('stm_lang', lang);
        DOM.langEnBtn.classList.toggle('active', lang === 'en');
        DOM.langRuBtn.classList.toggle('active', lang === 'ru');
        applyLocalization();
        const currentMode = document.querySelector('input[name="mode"]:checked').value;
        chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId']).then(sessionSettings => {
            updateControlSectionsVisibility(currentMode, sessionSettings);
        });
    };

    const bindEventListeners = () => {
        DOM.masterToggle.addEventListener('change', e => chrome.storage.sync.set({ isExtensionEnabled: e.target.checked }));
        DOM.muteAllToggle.addEventListener('change', e => chrome.storage.sync.set({ isAllMuted: e.target.checked }));
        DOM.modeForm.addEventListener('change', e => { if (e.target.name === 'mode') chrome.storage.sync.set({ mode: e.target.value }); });
        
        DOM.rememberLastTabToggle.addEventListener('change', e => chrome.storage.sync.set({ rememberLastTab: e.target.checked }));

        DOM.refreshSourceBtn.addEventListener('click', async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.url && !activeTab.url.startsWith('chrome://') && !activeTab.url.startsWith('chrome-extension://')) {
                chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
            }
        });
        DOM.showAllTabsFirstSound.addEventListener('change', e => {
            localStorage.setItem('showAllTabsFirstSound', e.target.checked);
            chrome.storage.session.get('firstAudibleTabId').then(({ firstAudibleTabId }) => refreshFirstSoundList(firstAudibleTabId));
        });
        DOM.showAllTabsWhitelist.addEventListener('change', e => {
            localStorage.setItem('showAllTabsWhitelist', e.target.checked);
            chrome.storage.session.get('whitelistedTabId').then(({ whitelistedTabId }) => refreshWhitelist(whitelistedTabId));
        });
        DOM.langEnBtn.addEventListener('click', () => switchLanguage('en'));
        DOM.langRuBtn.addEventListener('click', () => switchLanguage('ru'));

        chrome.storage.onChanged.addListener((changes, area) => {
            if (changes.isExtensionEnabled) {
                DOM.masterToggle.checked = changes.isExtensionEnabled.newValue;
                DOM.controlsWrapper.classList.toggle('disabled', !changes.isExtensionEnabled.newValue);
            }
            if (changes.isAllMuted) {
                DOM.muteAllToggle.checked = changes.isAllMuted.newValue;
            }
            if (changes.mode) {
                const newMode = changes.mode.newValue;
                document.querySelector(`input[name="mode"][value="${newMode}"]`).checked = true;
                chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId']).then(sessionSettings => {
                     updateControlSectionsVisibility(newMode, sessionSettings);
                });
            }
            if (changes.rememberLastTab) {
                DOM.rememberLastTabToggle.checked = changes.rememberLastTab.newValue;
            }
            if (changes.whitelistedTabId && document.querySelector('input[name="mode"]:checked').value === 'whitelist') {
                refreshWhitelist(changes.whitelistedTabId.newValue);
            }
            if (changes.firstAudibleTabId && document.querySelector('input[name="mode"]:checked').value === 'first-sound') {
                updateFirstSoundDisplay(changes.firstAudibleTabId.newValue);
                refreshFirstSoundList(changes.firstAudibleTabId.newValue);
            }
        });
    };

    const initialize = async () => {
        const [syncSettings, sessionSettings] = await Promise.all([
            chrome.storage.sync.get({ mode: 'active', isExtensionEnabled: true, isAllMuted: false, rememberLastTab: false }),
            chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId'])
        ]);
        const settings = { ...syncSettings, ...sessionSettings };
        
        DOM.masterToggle.checked = settings.isExtensionEnabled;
        DOM.muteAllToggle.checked = settings.isAllMuted;
        DOM.rememberLastTabToggle.checked = settings.rememberLastTab;
        DOM.controlsWrapper.classList.toggle('disabled', !settings.isExtensionEnabled);
        document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;

        DOM.langEnBtn.classList.toggle('active', currentLanguage === 'en');
        DOM.langRuBtn.classList.toggle('active', currentLanguage === 'ru');

        applyLocalization();
        updateControlSectionsVisibility(settings.mode, settings);
        await updateShortcutTooltips();
        bindEventListeners();
        
        document.body.style.opacity = 1;
    };

    initialize()
});