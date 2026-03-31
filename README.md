# Superior Tab Mute

<div align="center">
   <img src="https://raw.githubusercontent.com/le0booba/Superior_Tab_Mute/refs/heads/main/screen-options.png" alt="Superior Tab Mute Screenshot" width="275"/>

   **Intelligent Audio Control for Chrome**
   
   **English** | **[Русский](README.ru.md)**

   Stop the audio chaos. Superior Tab Mute puts you in command of your browser's soundscape, automatically silencing background tabs based on simple, powerful rules. This creates a focused environment, perfect for concentrating on work, enjoying uninterrupted music, or isolating a single stream. With its smart muting modes, instant controls, and clean design, you can finally browse in peace.

   ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
   ![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
   ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
</div>

---

## 🚀 Installation

1.  **Download the Extension**
    -   Download the [LATEST RELEASE](https://github.com/le0booba/Superior_Tab_Mute/releases/latest) from GitHub.
    -   Unzip the downloaded file.

2.  **Load in Chrome**
    -   Open Chrome and navigate to `chrome://extensions/`.
    -   Enable **Developer mode** (top-right toggle).
    -   Click **Load unpacked** and select the unzipped extension folder.

3.  **Start Using**
    -   Click the extension icon in Chrome's toolbar to access the popup and configure settings.

---

## 🌟 Features

### 🎯 Smart Muting Modes

-   **Active Tab Mode**: Only the currently active tab plays audio, perfect for focused browsing or work.
-   **First Sound Mode**: Prioritizes the first tab that plays audio, ideal for listening to music or podcasts in the background.
-   **Whitelist Mode**: Manually select a single tab to play audio, offering precise control for complex workflows.
-   **Mute New Tabs Mode**: Automatically mutes all newly opened tabs, keeping your session quiet by default.

### ⚡ Instant Controls

-   **Master Toggle**: Enable or disable the extension with a single click or shortcut (`Alt+S`).
-   **Global Mute**: Silence all tabs instantly (`Alt+A`).
-   **Set Sound Source**: Designate the current tab as the audio source in First Sound Mode (`Alt+W`).
-   **Show All Tabs**: View and select from all available tabs, not just audible ones, in First Sound and Whitelist modes.
-   **Expandable Options**: First Sound and Whitelist modes feature collapsible sections to reveal advanced settings and tab lists, keeping the interface clean and organized. Click the expand button (▼) to toggle additional controls.

### 🧠 Intelligent Automation

-   **Remember Last Source**: When enabled for "First Sound" or "Whitelist" mode, the extension automatically switches to a previously audible tab when your current source tab is closed. This ensures seamless listening without manual intervention, intelligently prioritizing your listening experience by falling back to the most recently active audio source.
-   **Default Settings on Startup**: Set your preferred mode and "Mute All" state as defaults. When Chrome starts, the extension automatically applies these settings, giving you a consistent experience every session. Mark any mode or the "Mute All" toggle with a star (★) to set it as your default.

<details>
<summary>🔧 Advanced Functionality</summary>

#### Core Architecture:
1. **Persistent & Synced Settings**: Core preferences sync across devices using `chrome.storage.sync` for a consistent experience. Settings include mode selection, extension state, mute all status, and remember last tab preference.
2. **Safe Tab Handling**: Automatically filters out Chrome system pages (`chrome://`) and extension pages (`chrome-extension://`) to prevent conflicts using `isManageableTab()` validation.
3. **Error Recovery**: Gracefully handles closed tabs through `safeGetTab()`, `safeUpdateTab()`, and `safeQueryTabs()` wrappers that catch and log errors without breaking functionality.
4. **Stratified Storage System**: 
   - `chrome.storage.sync`: User preferences (mode, settings, defaults) synced across devices
   - `chrome.storage.session`: Temporary tab IDs, source history, and expansion states cleared on browser restart
   - `chrome.storage.local`: Device-specific UI preferences (language, checkbox states)
5. **Multi-Language Support**: Built-in English and Russian localization with seamless language switching, storing language preference locally while dynamically loading interface text from `_locales/` JSON files on popup initialization.

**Performance Optimizations:**
1. **Debounced Event Handling**: Core muting operations like `applyMutingRules()` are debounced with a 150ms delay to prevent redundant executions during rapid tab changes and updates, reducing CPU usage during intensive browsing sessions.
2. **Parallel Async Operations**: Uses `Promise.all()` for simultaneous execution of independent operations in storage retrieval (`refreshCache()`), initialization routines (`handleStartup()`, `handleInstall()`), and bulk tab processing, significantly reducing overall latency.
3. **Cached Settings Management**: Implements an in-memory settings cache (`cachedSettings`) with fast-path retrieval via `getSettings()` and a deduplication guard (`settingsPromise`) that coalesces concurrent refresh calls into a single storage read, minimizing redundant API calls during event-heavy scenarios.
4. **Selective Tab Processing**: Filters manageable tabs upfront using `isManageableTab()` before any operations, excluding system pages to prevent unnecessary Chrome API calls across all muting operations.
5. **Mute State Pre-check**: Before issuing any `chrome.tabs.update()` call, the current mute state of each tab is compared against the desired state — tabs already in the correct state are skipped entirely. This is applied in `setTabsMuted()` via a filter on `tab.mutedInfo?.muted`, eliminating a significant share of Chrome API calls on every rule application cycle.

</details>

---

## 📖 Usage Guide

1.  **Open the Popup**
    -   Click the Superior Tab Mute icon in Chrome's toolbar to access the main controls.

2.  **Select a Mode**
    -   Choose your desired muting strategy: **Active Tab**, **First Sound**, **Whitelist**, or **Mute New Tabs** mode using the radio buttons.
    -   For "First Sound" or "Whitelist" modes, click the expand button (▼) at the bottom of the popup to reveal additional options and tab lists. Click again to show more options.
    -   Use the tab list to select your audio source. You can enable "Show all tabs" for more options.
    -   When using "First Sound" or "Whitelist" modes, check the **"Remember last source"** box to enable automatic source switching. The extension will seamlessly switch to previously audible tabs if your current source closes.

3.  **Set Default Behavior**
    -   Click the star icon (☆) next to any mode or the "Mute All" toggle to set it as your default.
    -   A filled star (★) indicates the current default setting.
    -   Default settings are automatically applied when Chrome starts, ensuring consistent behavior across sessions.

4.  **Use Keyboard Shortcuts**
    -   `Alt+S`: Toggle extension on/off
    -   `Alt+A`: Toggle mute all tabs
    -   `Alt+W`: Set current tab as sound source (First Sound mode)
    -   Hover over controls in the popup to see their shortcuts
    -   Customize shortcuts at `chrome://extensions/shortcuts`

---

## 🔒 Permissions & Privacy

### Privacy Commitment

-   **No Data Collection**: The extension does not collect, store, or transmit any personal data.
-   **No Analytics**: It includes no tracking scripts or communication with external servers.
-   **Local Operation**: All functionality runs entirely locally within your browser.

<details>
<summary>Permissions Used</summary>

-   **`tabs`**: Required to detect which tabs are playing audio, read their titles/favicons for the UI, and apply muting rules.
-   **`storage`**: Used to save user preferences locally and across devices for a consistent experience across browser sessions.

</details>

<details>
<summary>Synced Settings (chrome.storage.sync)</summary>

-   Settings stored in your Google account and synchronized across devices where you are signed into Chrome.
-   **`isExtensionEnabled`** (true/false): Controls whether the extension is active.
-   **`mode`** ('active', 'first-sound', 'whitelist', 'mute-new'): Defines the active muting mode.
-   **`isAllMuted`** (true/false): Toggles the global mute state for all tabs.
-   **`rememberLastTab`** (true/false): Remembers the preference for the "Remember Last Source" feature.
-   **`defaultMode`** (string or null): Stores the user's preferred default mode to apply on startup.
-   **`defaultMuteAll`** (true/false): Stores whether "Mute All" should be enabled by default on startup.
-   *Purpose*: Ensures your core preferences are consistent across all your devices.

</details>

<details>
<summary>Session Storage (chrome.storage.session)</summary>

-   Temporary settings that are cleared when the browser is closed.
-   **`firstAudibleTabId`** (tab ID): Tracks the designated audio source tab in "First Sound Mode".
-   **`whitelistedTabId`** (tab ID): Tracks the user-selected tab in "Whitelist Mode".
-   **`expansionStates`** (object): Remembers which expandable sections are open for each mode during the current session.
-   **`muteNewInitialTabIds`** (array): Tracks tabs that existed when "Mute New Tabs" mode was activated, used to manage unmuting behavior.
-   **`firstSoundSourceHistory`** (array): Stores the IDs of up to 3 recently active source tabs in "First Sound Mode", used by "Remember last source" to fall back to an audible alternative when the current source is closed.
-   **`whitelistSourceHistory`** (array): Stores the IDs of up to 3 recently active source tabs in "Whitelist Mode", used by "Remember last source" to fall back to an audible alternative when the current source is closed.
-   *Purpose*: Tab IDs are unique to each browser session and would be invalid across devices or after a restart, making session storage the ideal choice.

</details>

<details>
<summary>Local Storage (chrome.storage.local)</summary>

-   Settings that are persistent on the device but are not synced across accounts.
-   **`stm_lang`** ('en'/'ru'): Remembers the language preference for the interface.
-   **`showAllTabsFirstSound`** (true/false): Remembers the "Show all tabs" checkbox state for First Sound Mode.
-   **`showAllTabsWhitelist`** (true/false): Remembers the "Show all tabs" checkbox state for Whitelist Mode.
-   *Purpose*: Allows for device-specific UI preferences, such as having different settings on your work and home computers.

</details>

---

## 📁 File Structure
```
Superior_Tab_Mute/
├── 📋 manifest.json         # Extension configuration and permissions
├── 🔧 background.js         # Core muting logic and event handling
├── 🖹 popup.html            # The structure of the user interface
├── ⚙️ popup.js              # UI logic and user interactions
├── 🎨 popup.css             # Modern dark theme styling
├── 🌐 _locales/             # Internationalization files
│   ├── 📁 en/                  # English translations
│   │   └── 📄 messages.json       # English locale strings
│   └── 📁 ru/                  # Russian translations
│       └── 📄 messages.json       # Russian locale strings
├── 🗂 icons/                # Extension status icons
│   ├── 🖼️ icon16.png           # Default state (16x16)
│   ├── 🖼️ icon16_mute.png      # All tabs muted state (16x16)
│   ├── 🖼️ icon16_off.png       # Disabled state (16x16)
│   ├── 🖼️ icon48.png           # Default state (48x48)
│   ├── 🖼️ icon48_mute.png      # All tabs muted state (48x48)
│   ├── 🖼️ icon48_off.png       # Disabled state (48x48)
│   ├── 🖼️ icon128.png          # Default state (128x128)
│   ├── 🖼️ icon128_mute.png     # All tabs muted state (128x128)
│   └── 🖼️ icon128_off.png      # Disabled state (128x128)
├── 📄 LICENSE               # MIT License
└── 📖 README.md             # This documentation
```

---

<div align="center">
   
  **Made with ❤️ by badrenton**
  
  *© 2026 • If you find this extension helpful, please consider giving it a ⭐ on GitHub!*
</div>
