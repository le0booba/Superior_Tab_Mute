// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const getSync = keys => new Promise(r => chrome.storage.sync.get(keys, r));
    const setSync = obj => new Promise(r => chrome.storage.sync.set(obj, r));
    const getSession = keys => new Promise(r => chrome.storage.session.get(keys, r));
    const setSession = obj => new Promise(r => chrome.storage.session.set(obj, r));
    const qs = sel => document.querySelector(sel);

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
    const t = key => locales[currentLang][key] || locales['en'][key];

    const controlsWrapper = qs('#controls-wrapper');
    const firstSoundControls = qs('#first-sound-controls');
    const whitelistControls = qs('#whitelist-controls');
    const modeForm = qs('#mode-form');

    function localizeUI() {
        document.querySelectorAll('[data-locale]').forEach(el => {
            el.textContent = t(el.dataset.locale);
        });
        qs('#version-info').textContent = `${chrome.runtime.getManifest().name} v${chrome.runtime.getManifest().version}`;
        qs('#author-info').textContent = `${t('by')} badrenton`;
        qs('#github-link').textContent = t('github');
    }

    function renderTabsList({ container, tabs, selectedId, onSelect }) {
        container.innerHTML = '';
        if (tabs.length === 0) {
            container.innerHTML = `<li class="no-sound">${t('noTabs')}</li>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        tabs.forEach(tab => {
            const li = document.createElement('li');
            li.dataset.tabId = tab.id;
            li.innerHTML = `<img src="${tab.favIconUrl || 'icons/icon16.png'}" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">` +
                           `<span>${tab.title || 'Untitled Tab'}</span>`;
            if (tab.id === selectedId) li.classList.add('selected');
            li.onclick = () => onSelect(tab.id, li);
            fragment.appendChild(li);
        });
        container.appendChild(fragment);
    }
    
    async function setupTabListSection({ listElem, showAllCheckbox, storageKey, showAllKey, onSelect }) {
        const { [storageKey]: selectedId } = await getSession(storageKey);
        const showAll = localStorage.getItem(showAllKey) === 'true';
        showAllCheckbox.checked = showAll;
        
        const query = showAll ? {} : { audible: true };
        const tabs = (await chrome.tabs.query(query)).filter(t => t.id && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));

        renderTabsList({
            container: listElem,
            tabs,
            selectedId,
            onSelect: (tabId, li) => {
                onSelect(tabId);
                listElem.querySelector('.selected')?.classList.remove('selected');
                li.classList.add('selected');
            }
        });
    }

    async function setupFirstSoundControls() {
        const { firstAudibleTabId } = await getSession('firstAudibleTabId');
        const display = qs('#current-sound-source-display');
        display.className = '';
        if (firstAudibleTabId) {
            try {
                const tab = await chrome.tabs.get(firstAudibleTabId);
                display.innerHTML = `<img src="${tab.favIconUrl || 'icons/icon16.png'}" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">` + `${t('sourcePrefix')} ${tab.title}`;
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
            onSelect: tabId => setSession({ firstAudibleTabId: tabId })
        });
    }

    async function setupWhitelistControls() {
        await setupTabListSection({
            listElem: qs('#audible-tabs-list'),
            showAllCheckbox: qs('#show-all-tabs-whitelist'),
            storageKey: 'whitelistedTabId',
            showAllKey: 'showAllTabsWhitelist',
            onSelect: tabId => setSession({ whitelistedTabId: tabId })
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
            const isEnabled = e.target.checked;
            setSync({ isExtensionEnabled: isEnabled });
            controlsWrapper.classList.toggle('disabled', !isEnabled);
        };
        
        qs('#mute-all-toggle-switch').onchange = e => setSync({ isAllMuted: e.target.checked });
        
        modeForm.onchange = e => {
            if (e.target.name === 'mode') {
                const newMode = e.target.value;
                setSync({ mode: newMode });
                updateUIVisibility(newMode);
            }
        };

        qs('#refresh-first-sound-btn').onclick = async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab) {
                await setSession({ firstAudibleTabId: activeTab.id });
                setupFirstSoundControls();
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
        
        qs('#lang-en').onclick = () => switchLanguage('en');
        qs('#lang-ru').onclick = () => switchLanguage('ru');
    }

    function switchLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('stm_lang', lang);
        
        qs('#lang-en').classList.toggle('active', lang === 'en');
        qs('#lang-ru').classList.toggle('active', lang === 'ru');
        
        localizeUI();
        const currentMode = qs('input[name="mode"]:checked').value;
        updateUIVisibility(currentMode);
    }

    async function init() {
        const data = await getSync(['mode', 'isExtensionEnabled', 'isAllMuted']);
        const isEnabled = data.isExtensionEnabled !== false;
        
        qs('#master-toggle-switch').checked = isEnabled;
        qs('#mute-all-toggle-switch').checked = data.isAllMuted === true;
        controlsWrapper.classList.toggle('disabled', !isEnabled);
        qs(`input[name="mode"][value="${data.mode || 'active'}"]`).checked = true;

        qs('#lang-en').classList.toggle('active', currentLang === 'en');
        qs('#lang-ru').classList.toggle('active', currentLang === 'ru');
        
        localizeUI();
        attachEventListeners();
        updateUIVisibility(data.mode);
    }
    
    init();
});