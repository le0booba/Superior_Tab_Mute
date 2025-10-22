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
            github: 'Page on GitHub',
            rememberLastTab: 'Remember last source',
            rememberLastTabDesc: 'If the source tab goes silent, auto-switch to the last audible tab.',
            resetMuteNew: '🗔 Reset Mute on All Tabs',
            resetSuccess: '✅ d o n e',
            clearSource: 'Clear sound source'
        },
        ru: {
            muteAll: '🔇 Заглушить все',
            modeActive: 'Заглушить все, кроме <b>активной</b>',
            modeFirstSound: 'Заглушить все, кроме <b>1ой со звуком</b>',
            modeWhitelist: 'Заглушить все, кроме <b>выбранной</b>',
            modeMuteNew: 'Заглушать все <b>новые</b> вкладки',
            selectTabToUnmute: 'Выберите вкладку для звука:',
            showAllTabs: 'Показать все вкладки',
            refreshSource: 'Текущая вкладка ➜ 🔊',
            noTabs: 'Вкладки не найдены.',
            noSoundSource: 'Источник звука не назначен.',
            sourceClosed: 'Вкладка-источник закрыта.',
            sourcePrefix: 'ИСТОЧНИК:',
            github: 'Страница на GitHub',
            rememberLastTab: 'Помнить источник',
            rememberLastTabDesc: 'Если источник затихнет, автоматически переключиться на последнюю вкладку со звуком.',
            resetMuteNew: '🗔 Сбросить обеззвучивание',
            resetSuccess: '✅ Готово!',
            clearSource: 'Очистить источник звука'
        }
    };
    let currentLanguage = 'en';

    const DOM = {
        controlsWrapper: document.getElementById('controls-wrapper'),
        firstSoundControls: document.getElementById('first-sound-controls'),
        whitelistControls: document.getElementById('whitelist-controls'),
        muteNewControls: document.getElementById('mute-new-controls'),
        resetMuteNewBtn: document.getElementById('reset-mute-new-btn'),
        masterToggle: document.getElementById('master-toggle-switch'),
        muteAllToggle: document.getElementById('mute-all-toggle-switch'),
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
        document.querySelectorAll('[data-locale], [data-locale-title]').forEach(el => {
            if (el.dataset.locale) {
                el.innerHTML = getLocaleString(el.dataset.locale);
            }
            if (el.dataset.localeTitle) {
                el.title = getLocaleString(el.dataset.localeTitle);
            }
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
        if (tabs.length === 0) {
            if (!container.querySelector('.no-sound')) {
                container.innerHTML = `<li class="tab-list-item no-sound">${getLocaleString('noTabs')}</li>`;
            }
            return;
        }

        container.querySelector('.no-sound')?.remove();

        const existingNodes = new Map([...container.children].map(li => [li.dataset.tabId, li]));
        const fragmentForNewNodes = document.createDocumentFragment();

        tabs.forEach(tab => {
            const tabIdStr = String(tab.id);
            const existingLi = existingNodes.get(tabIdStr);

            if (existingLi) {
                existingLi.classList.toggle('selected', tab.id === selectedId);
                const img = existingLi.querySelector('.tab-list-icon');
                const newFavIconUrl = tab.favIconUrl || 'icons/icon16.png';
                if (img.src !== newFavIconUrl) img.src = newFavIconUrl;

                const span = existingLi.querySelector('.tab-list-title');
                const newTitle = tab.title || 'Untitled Tab';
                if (span.textContent !== newTitle) {
                    span.textContent = newTitle;
                    span.title = newTitle;
                }
                existingNodes.delete(tabIdStr);
            } else {
                const li = document.createElement('li');
                li.className = 'tab-list-item';
                li.dataset.tabId = tab.id;
                if (tab.id === selectedId) li.classList.add('selected');
                li.innerHTML = `
                    <img class="tab-list-icon" src="${tab.favIconUrl || 'icons/icon16.png'}" alt="">
                    <div class="tab-title-wrapper">
                        <span class="tab-list-title" title="${tab.title || 'Untitled Tab'}">${tab.title || 'Untitled Tab'}</span>
                    </div>`;
                fragmentForNewNodes.appendChild(li);
            }
        });

        if (fragmentForNewNodes.children.length > 0) {
            container.appendChild(fragmentForNewNodes);
        }

        existingNodes.forEach(node => node.remove());
    };

    const populateTabList = async ({ listElem, showAllCheckbox, showAllKey, onSelect, selectedId }) => {
        const { [showAllKey]: showAll } = await chrome.storage.local.get({ [showAllKey]: false });
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
        showAllKey: 'showAllTabsFirstSound',
        onSelect: tabId => chrome.storage.session.set({ firstAudibleTabId: tabId }),
        selectedId: firstAudibleTabId
    });

    const refreshWhitelist = (whitelistedTabId) => populateTabList({
        listElem: DOM.audibleTabsList,
        showAllCheckbox: DOM.showAllTabsWhitelist,
        showAllKey: 'showAllTabsWhitelist',
        onSelect: tabId => chrome.storage.session.set({ whitelistedTabId: tabId }),
        selectedId: whitelistedTabId
    });

    const updateControlSectionsVisibility = async (mode, settings) => {
        const showRememberOption = mode === 'first-sound' || mode === 'whitelist';
        DOM.rememberOptionWrapper.classList.toggle('hidden', !showRememberOption);

        DOM.firstSoundControls.classList.toggle('hidden', mode !== 'first-sound');
        DOM.whitelistControls.classList.toggle('hidden', mode !== 'whitelist');
        DOM.muteNewControls.classList.toggle('hidden', mode !== 'mute-new');

        if (mode === 'first-sound') {
            await updateFirstSoundDisplay(settings.firstAudibleTabId);
            await refreshFirstSoundList(settings.firstAudibleTabId);
        } else if (mode === 'whitelist') {
            await refreshWhitelist(settings.whitelistedTabId);
        }
    };

    const switchLanguage = async (lang) => {
        if (currentLanguage === lang) return;
        currentLanguage = lang;
        await chrome.storage.local.set({ stm_lang: lang });
        DOM.langEnBtn.classList.toggle('active', lang === 'en');
        DOM.langRuBtn.classList.toggle('active', lang === 'ru');
        applyLocalization();
        const currentMode = document.querySelector('input[name="mode"]:checked').value;
        const sessionSettings = await chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId']);
        await updateControlSectionsVisibility(currentMode, sessionSettings);
    };

    const bindEventListeners = () => {
        DOM.masterToggle.addEventListener('change', e => chrome.storage.sync.set({ isExtensionEnabled: e.target.checked }));
        DOM.muteAllToggle.addEventListener('change', e => chrome.storage.sync.set({ isAllMuted: e.target.checked }));
        DOM.modeForm.addEventListener('change', e => { if (e.target.name === 'mode') chrome.storage.sync.set({ mode: e.target.value }); });

        DOM.resetMuteNewBtn.addEventListener('click', () => {
            if (DOM.resetMuteNewBtn.classList.contains('success')) return;
            chrome.runtime.sendMessage({ action: 'resetMuteNew' });
            const originalText = DOM.resetMuteNewBtn.innerHTML;
            DOM.resetMuteNewBtn.innerHTML = getLocaleString('resetSuccess');
            DOM.resetMuteNewBtn.classList.add('success');
            setTimeout(() => {
                DOM.resetMuteNewBtn.innerHTML = originalText;
                DOM.resetMuteNewBtn.classList.remove('success');
            }, 1500);
        });

        DOM.rememberLastTabToggle.addEventListener('change', e => chrome.storage.sync.set({ rememberLastTab: e.target.checked }));

        DOM.setSourceBtn.addEventListener('click', async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab?.id && !activeTab.url.startsWith('chrome://') && !activeTab.url.startsWith('chrome-extension://')) {
                chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
            }
        });

        DOM.clearSourceBtn.addEventListener('click', () => chrome.storage.session.set({ firstAudibleTabId: null }));
        DOM.clearWhitelistBtn.addEventListener('click', () => chrome.storage.session.set({ whitelistedTabId: null }));

        DOM.showAllTabsFirstSound.addEventListener('change', async e => {
            await chrome.storage.local.set({ showAllTabsFirstSound: e.target.checked });
            const { firstAudibleTabId } = await chrome.storage.session.get('firstAudibleTabId');
            await refreshFirstSoundList(firstAudibleTabId);
        });

        DOM.showAllTabsWhitelist.addEventListener('change', async e => {
            await chrome.storage.local.set({ showAllTabsWhitelist: e.target.checked });
            const { whitelistedTabId } = await chrome.storage.session.get('whitelistedTabId');
            await refreshWhitelist(whitelistedTabId);
        });

        DOM.langSwitcher.addEventListener('click', (e) => {
            const lang = e.target.closest('.lang-btn')?.id.split('-')[1];
            if (lang) switchLanguage(lang);
        });

        chrome.storage.onChanged.addListener(async (changes) => {
            const mode = document.querySelector('input[name="mode"]:checked').value;
            if (changes.isExtensionEnabled) {
                DOM.masterToggle.checked = changes.isExtensionEnabled.newValue;
                DOM.controlsWrapper.classList.toggle('disabled', !changes.isExtensionEnabled.newValue);
            }
            if (changes.isAllMuted) DOM.muteAllToggle.checked = changes.isAllMuted.newValue;
            if (changes.rememberLastTab) DOM.rememberLastTabToggle.checked = changes.rememberLastTab.newValue;

            if (changes.mode) {
                const newMode = changes.mode.newValue;
                document.querySelector(`input[name="mode"][value="${newMode}"]`).checked = true;
                const sessionSettings = await chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId']);
                await updateControlSectionsVisibility(newMode, sessionSettings);
            }
            if (changes.whitelistedTabId && mode === 'whitelist') {
                await refreshWhitelist(changes.whitelistedTabId.newValue);
            }
            if (changes.firstAudibleTabId && mode === 'first-sound') {
                await updateFirstSoundDisplay(changes.firstAudibleTabId.newValue);
                await refreshFirstSoundList(changes.firstAudibleTabId.newValue);
            }
        });
    };

    const initialize = async () => {
        const [syncSettings, sessionSettings, localSettings] = await Promise.all([
            chrome.storage.sync.get({ mode: 'active', isExtensionEnabled: true, isAllMuted: false, rememberLastTab: false }),
            chrome.storage.session.get(['firstAudibleTabId', 'whitelistedTabId']),
            chrome.storage.local.get({ stm_lang: 'en' })
        ]);
        currentLanguage = localSettings.stm_lang;
        const settings = { ...syncSettings, ...sessionSettings };

        DOM.masterToggle.checked = settings.isExtensionEnabled;
        DOM.muteAllToggle.checked = settings.isAllMuted;
        DOM.rememberLastTabToggle.checked = settings.rememberLastTab;
        DOM.controlsWrapper.classList.toggle('disabled', !settings.isExtensionEnabled);
        document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;

        DOM.langEnBtn.classList.toggle('active', currentLanguage === 'en');
        DOM.langRuBtn.classList.toggle('active', currentLanguage === 'ru');

        applyLocalization();
        await updateControlSectionsVisibility(settings.mode, settings);
        await updateShortcutTooltips();
        bindEventListeners();

        document.body.style.opacity = 1;
    };

    initialize();
});