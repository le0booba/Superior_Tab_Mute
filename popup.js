document.addEventListener('DOMContentLoaded', () => {
    const qs = sel => document.querySelector(sel);
    const manifest = chrome.runtime.getManifest();

    const locales = {
        en: {
            masterToggle: '❌ / ✔️',
            muteAll: '🔇 Mute All Tabs',
            modeActive: 'Mute all except active tab',
            modeFirstSound: 'Mute all except first tab with sound',
            modeWhitelist: 'Mute all except a specific tab',
            selectTabToUnmute: 'Select a Tab to Unmute:',
            showAllTabs: 'Show all tabs',
            refreshSource: '🎵 Current Tab 🠆 SOURCE',
            noTabs: 'No tabs found.',
            noSoundSource: 'No sound source designated.',
            sourceClosed: 'Source tab has been closed.',
            sourcePrefix: 'SOURCE:',
            by: 'by',
            github: 'Page on GitHub'
        },
        ru: {
            masterToggle: '❌ / ✔️',
            muteAll: '🔇 Заглушить все',
            modeActive: 'Заглушить все, кроме активной',
            modeFirstSound: 'Заглушить все, кроме 1ой со звуком',
            modeWhitelist: 'Заглушить все, кроме выбранной',
            selectTabToUnmute: 'Выберите вкладку для звука:',
            showAllTabs: 'Показать все вкладки',
            refreshSource: '🎵 Текущая вкладка 🠆 ИСТОЧНИК',
            noTabs: 'Вкладки не найдены.',
            noSoundSource: 'Источник звука не назначен.',
            sourceClosed: 'Вкладка-источник закрыта.',
            sourcePrefix: 'ИСТОЧНИК:',
            github: 'Страница на GitHub'
        }
    };

    let currentLang = localStorage.getItem('stm_lang') || 'en';
    const t = key => locales[currentLang][key] || locales.en[key];

    const controlsWrapper = qs('#controls-wrapper');
    const firstSoundControls = qs('#first-sound-controls');
    const whitelistControls = qs('#whitelist-controls');

    function localizeUI() {
        document.querySelectorAll('[data-locale]').forEach(el => {
            el.textContent = t(el.dataset.locale);
        });
        qs('#version-info').textContent = `${manifest.name} v${manifest.version}`;
        qs('#author-info').textContent = `${t('by')} badrenton`;
        qs('#github-link').textContent = t('github');
    }

    function renderTabsList({ container, tabs, selectedId }) {
        container.innerHTML = '';
        if (tabs.length === 0) {
            const li = document.createElement('li');
            li.className = 'no-sound';
            li.textContent = t('noTabs');
            container.appendChild(li);
            return;
        }

        const fragment = document.createDocumentFragment();
        tabs.forEach(tab => {
            const li = document.createElement('li');
            li.className = 'tab-list-item';
            li.dataset.tabId = tab.id;

            const img = document.createElement('img');
            img.className = 'tab-list-icon';
            img.src = tab.favIconUrl || 'icons/icon16.png';
            
            const span = document.createElement('span');
            span.textContent = tab.title || 'Untitled Tab';

            li.appendChild(img);
            li.appendChild(span);
            if (tab.id === selectedId) li.classList.add('selected');
            fragment.appendChild(li);
        });
        container.appendChild(fragment);
    }

    async function setupTabListSection({ listElem, showAllCheckbox, storageKey, showAllKey, onSelect }) {
        const { [storageKey]: selectedId } = await chrome.storage.session.get(storageKey);
        const showAll = localStorage.getItem(showAllKey) === 'true';
        showAllCheckbox.checked = showAll;

        const query = showAll ? {} : { audible: true };
        const tabs = (await chrome.tabs.query(query)).filter(t => t.id && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));

        listElem.onclick = (e) => {
            const li = e.target.closest('.tab-list-item');
            if (!li || !li.dataset.tabId) return;

            const tabId = parseInt(li.dataset.tabId, 10);
            onSelect(tabId);
        };

        renderTabsList({ container: listElem, tabs, selectedId });
    }

    async function setupFirstSoundControls() {
        const { firstAudibleTabId } = await chrome.storage.session.get('firstAudibleTabId');
        const display = qs('#current-sound-source-display');
        display.className = 'current-sound-source-display';

        if (firstAudibleTabId) {
            try {
                const tab = await chrome.tabs.get(firstAudibleTabId);
                display.innerHTML = `<img src="${tab.favIconUrl || 'icons/icon16.png'}" class="tab-list-icon"><span>${t('sourcePrefix')} ${tab.title}</span>`;
                display.classList.add('active');
            } catch {
                display.textContent = t('sourceClosed');
                display.classList.add('error');
            }
        } else {
            display.textContent = t('noSoundSource');
        }

        await setupTabListSection({
            listElem: qs('#first-sound-tabs-list'),
            showAllCheckbox: qs('#show-all-tabs-first-sound'),
            storageKey: 'firstAudibleTabId',
            showAllKey: 'showAllTabsFirstSound',
            onSelect: tabId => chrome.storage.session.set({ firstAudibleTabId: tabId })
        });
    }

    async function setupWhitelistControls() {
        await setupTabListSection({
            listElem: qs('#audible-tabs-list'),
            showAllCheckbox: qs('#show-all-tabs-whitelist'),
            storageKey: 'whitelistedTabId',
            showAllKey: 'showAllTabsWhitelist',
            onSelect: tabId => chrome.storage.session.set({ whitelistedTabId: tabId })
        });
    }

    function updateUIVisibility(mode) {
        firstSoundControls.classList.toggle('hidden', mode !== 'first-sound');
        whitelistControls.classList.toggle('hidden', mode !== 'whitelist');

        if (mode === 'first-sound') setupFirstSoundControls();
        else if (mode === 'whitelist') setupWhitelistControls();
    }
    
    function attachEventListeners() {
        qs('#master-toggle-switch').onchange = e => {
            chrome.storage.sync.set({ isExtensionEnabled: e.target.checked });
        };

        qs('#mute-all-toggle-switch').onchange = e => chrome.storage.sync.set({ isAllMuted: e.target.checked });

        qs('#mode-form').onchange = e => {
            if (e.target.name === 'mode') {
                chrome.storage.sync.set({ mode: e.target.value });
            }
        };

        qs('#refresh-first-sound-btn').onclick = async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab) {
                await chrome.storage.session.set({ firstAudibleTabId: activeTab.id });
            }
        };

        qs('#show-all-tabs-first-sound').onchange = e => {
            localStorage.setItem('showAllTabsFirstSound', e.target.checked);
            setupFirstSoundControls();
        };

        qs('#show-all-tabs-whitelist').onchange = e => {
            localStorage.setItem('showAllTabsWhitelist', e.target.checked);
            setupWhitelistControls();
        };

        qs('.lang-switcher').onclick = e => {
            const btn = e.target.closest('.lang-btn');
            if (btn) {
                switchLanguage(btn.id === 'lang-ru' ? 'ru' : 'en');
            }
        };

        chrome.storage.onChanged.addListener((changes, area) => {
            const currentMode = qs('input[name="mode"]:checked')?.value;
            if (changes.isExtensionEnabled) {
                const isEnabled = changes.isExtensionEnabled.newValue;
                qs('#master-toggle-switch').checked = isEnabled;
                controlsWrapper.classList.toggle('disabled', !isEnabled);
            }
            if (changes.isAllMuted) {
                qs('#mute-all-toggle-switch').checked = changes.isAllMuted.newValue;
            }
            if (changes.mode) {
                const newMode = changes.mode.newValue;
                qs(`input[name="mode"][value="${newMode}"]`).checked = true;
                updateUIVisibility(newMode);
            }
            if (changes.whitelistedTabId && currentMode === 'whitelist') {
                setupWhitelistControls();
            }
            if (changes.firstAudibleTabId && currentMode === 'first-sound') {
                setupFirstSoundControls();
            }
        });
    }

    function switchLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('stm_lang', lang);
        qs('#lang-en').classList.toggle('active', lang === 'en');
        qs('#lang-ru').classList.toggle('active', lang === 'ru');
        localizeUI();
        updateUIVisibility(qs('input[name="mode"]:checked').value);
    }

    async function init() {
        const {
            mode = 'active',
            isExtensionEnabled = true,
            isAllMuted = false
        } = await chrome.storage.sync.get(['mode', 'isExtensionEnabled', 'isAllMuted']);

        qs('#master-toggle-switch').checked = isExtensionEnabled;
        qs('#mute-all-toggle-switch').checked = isAllMuted;
        controlsWrapper.classList.toggle('disabled', !isExtensionEnabled);
        qs(`input[name="mode"][value="${mode}"]`).checked = true;

        qs('#lang-en').classList.toggle('active', currentLang === 'en');
        qs('#lang-ru').classList.toggle('active', currentLang === 'ru');

        localizeUI();
        attachEventListeners();
        updateUIVisibility(mode);
    }

    init();
});