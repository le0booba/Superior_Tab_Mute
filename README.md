# Superior Tab Mute

<div align="center">
   <img src="https://raw.githubusercontent.com/le0booba/Superior_Tab_Mute/refs/heads/main/screen-options.png" alt="Superior Tab Mute Screenshot" width="230"/>

   **Intelligent Audio Control for Chrome**

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

-   **Master Toggle**: Enable or disable the extension with a single click or shortcut (`Alt+Shift+S`).
-   **Global Mute**: Silence all tabs instantly (`Alt+Shift+A`).
-   **Set Sound Source**: Designate the current tab as the audio source in First Sound Mode (`Alt+Shift+E`).
-   **Show All Tabs**: View and select from all available tabs, not just audible ones, in First Sound and Whitelist modes.
-   **Expandable Options**: First Sound and Whitelist modes feature collapsible sections to reveal advanced settings and tab lists, keeping the interface clean and organized. Click the expand button (▼) to toggle additional controls.

### 🧠 Intelligent Automation

-   **Remember Last Source**: When enabled for "First Sound" or "Whitelist" mode, the extension automatically switches to previously audible tabs when your current source tab goes silent or is closed. This ensures seamless listening without manual intervention, intelligently prioritizing your listening experience by falling back to the most recently active audio source.
-   **Default Settings on Startup**: Set your preferred mode and "Mute All" state as defaults. When Chrome starts, the extension automatically applies these settings, giving you a consistent experience every session. Mark any mode or the "Mute All" toggle with a star (★) to set it as your default.

<details>
<summary>🔧 Advanced Functionality</summary>

**Core Architecture:**
-   **Persistent & Synced Settings**: Core preferences sync across devices using your Chrome account.
-   **Safe Handling**: Automatically ignores Chrome system pages (`chrome://`) and other extensions to prevent conflicts.
-   **Error Recovery**: Intelligently handles closed tabs by clearing their status and automatically updating muting rules.
-   **Smart Source Switching**: Automatically switches to alternative audio sources when the current source becomes unavailable.
-   **Stratified Storage System**: Uses appropriate storage mechanisms (sync for user preferences, session for temporary tab IDs, local for device-specific UI settings) to ensure data persistence and cross-device compatibility.
-   **Startup Configuration**: Applies your default mode and mute preferences automatically when Chrome launches.

**Performance Optimizations:**
1. **Debounced Event Handling**: Frequent operations like applying muting rules and updating popup data are debounced (150ms delay) to prevent redundant executions and reduce CPU load during rapid tab changes or updates.

2. **Parallel Async Operations**: Uses `Promise.all()` to execute independent storage reads and tab queries simultaneously, significantly reducing latency when fetching combined settings from multiple storage areas.

3. **Efficient DOM Manipulation**: Implements intelligent rendering strategies including reusing existing DOM nodes via Map lookups, batching insertions with DocumentFragment, and updating only changed properties (icon URLs, titles) to minimize reflows and repaints.

4. **Selective Tab Processing**: Filters manageable tabs upfront using `isManageableTab()` to exclude system pages and extensions, preventing unnecessary API calls and reducing iteration overhead across all muting operations.

5. **Optimized Storage Access**: Minimizes storage I/O by caching popup tab data in session storage and only updating when actual changes occur, while strategically using sync storage for settings that need cross-device persistence and local storage for device-specific preferences.

</details>

---

## 📖 Usage Guide

1.  **Open the Popup**
    -   Click the Superior Tab Mute icon in Chrome's toolbar to access the main controls.

2.  **Select a Mode**
    -   Choose your desired muting strategy: **Active Tab**, **First Sound**, **Whitelist**, or **Mute New Tabs** mode using the radio buttons.
    -   For "First Sound" or "Whitelist" modes, click the expand button (▼) at the bottom of the popup to reveal additional options and tab lists. Click again to show more options.
    -   Use the tab list to select your audio source. You can enable "Show all tabs" for more options.
    -   When using "First Sound" or "Whitelist" modes, check the **"Remember last source"** box to enable automatic source switching. The extension will seamlessly switch to previously audible tabs if your current source stops playing or closes.

3.  **Set Default Behavior**
    -   Click the star icon (☆) next to any mode or the "Mute All" toggle to set it as your default.
    -   A filled star (★) indicates the current default setting.
    -   Default settings are automatically applied when Chrome starts, ensuring consistent behavior across sessions.

4.  **Use Keyboard Shortcuts**
    -   `Alt+Shift+S`: Toggle extension on/off
    -   `Alt+Shift+A`: Toggle mute all tabs
    -   `Alt+Shift+E`: Set current tab as sound source (First Sound mode)
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
-   **`storage`**: Used to save user preferences locally for a consistent experience across browser sessions.

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
-   **`popupTabsData`** (array of tab objects): Cached tab information for efficient popup rendering, including tab IDs, titles, favicons, audible status, and URLs.
-   **`expansionStates`** (object): Remembers which expandable sections are open for each mode during the current session.
-   **`muteNewInitialTabIds`** (array): Tracks tabs that existed when "Mute New Tabs" mode was activated, used to manage unmuting behavior.
-   *Purpose*: Tab IDs are unique to each browser session and would be invalid across devices or after a restart, making session storage the ideal choice.

</details>

<details>
<summary>Local Storage (localStorage)</summary>

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
├── 🗂 icons/                # Extension status icons
│   ├── 🖼️ icon16.png           # Default state
│   ├── 🖼️ icon16_mute.png      # All tabs muted state
│   ├── 🖼️ icon16_off.png       # Disabled state
│   ├── 🖼️ icon48.png           # Default state
│   ├── 🖼️ icon48_mute.png      # All tabs muted state
│   ├── 🖼️ icon48_off.png       # Disabled state
│   ├── 🖼️ icon128.png          # Default state
│   ├── 🖼️ icon128_mute.png     # All tabs muted state
│   └── 🖼️ icon128_off.png      # Disabled state
├── 📄 LICENSE.md            # MIT License
└── 📖 README.md             # This documentation
```

---

<div align="center">
   
  **Made with ❤️ by badrenton**
  
  *© 2025 • If you find this extension helpful, please consider giving it a ⭐ on GitHub!*
</div>
