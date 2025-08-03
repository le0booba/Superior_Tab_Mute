# Superior Tab Mute

**Advanced Chrome Extension for Intelligent Audio Control**

<div align="center">
   <img src="https://raw.githubusercontent.com/le0booba/Superior_Tab_Mute/refs/heads/main/screen-1.png" alt="Superior Tab Mute Screenshot" width="250"/>
</div>

Superior Tab Mute provides sophisticated audio management for Chrome tabs, automatically muting tabs based on user-defined rules to reduce distractions and enhance focus. With multiple muting modes, intuitive controls, and a sleek interface, it’s ideal for work, streaming, or complex browsing workflows.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)

---

## 🚀 Installation

1.  **Download the Extension**
    -   Visit the [LATEST RELEASE](https://github.com/le0booba/Superior_Tab_Mute/releases/latest) on GitHub and download the `Superior_Tab_Mute.zip` file.
    -   Unzip the downloaded file.

2.  **Load in Chrome**
    -   Open Chrome and navigate to `chrome://extensions/`.
    -   Enable **Developer mode** (top-right toggle).
    -   Click **Load unpacked** and select the unzipped extension folder.

3.  **Start Using**
    -   Click the extension icon in Chrome’s toolbar to access the popup and configure settings.

---

## 🌟 Features

### 🎯 Smart Muting Modes

-   **Active Tab Mode**: Only the currently active tab plays audio, perfect for focused browsing or work.
-   **First Sound Mode**: Prioritizes the first tab that plays audio, ideal for listening to music or podcasts in the background.
-   **Whitelist Mode**: Manually select a single tab to play audio, offering precise control for complex workflows.

### ⚡ Instant Controls

-   **Master Toggle**: Enable or disable the extension with a single click or shortcut (`Alt+Shift+S`).
-   **Global Mute**: Silence all tabs instantly (`Alt+Shift+M`).
-   **Set Sound Source**: Designate the current tab as the audio source in First Sound Mode (`Alt+Shift+E`).
-   **Show All Tabs**: View and select from all available tabs, not just audible ones, in First Sound and Whitelist modes.

<details>
<summary>🔧 Customize Behavior</summary>

-   Toggle the extension on/off or mute all tabs using the switches in the popup or their dedicated shortcuts.
-   In "First Sound Mode," click the **🎵 Current Tab 🠆 SOURCE** button to instantly set the currently active tab as the new audio source.
-   Configure keyboard shortcuts at `chrome://extensions/shortcuts`:
    -   `Alt+Shift+S`: Toggle extension on/off.
    -   `Alt+Shift+M`: Mute/unmute all tabs.
    -   `Alt+Shift+E`: Set current tab as sound source (in First Sound Mode).

</details>

<details>
<summary>🎨 User-Friendly Interface</summary>

-   **Dynamic Status Icons**: The extension icon changes to reflect the current state (active, muted, or disabled).
-   **Real-Time Tab List**: Displays tabs with audio or all tabs, complete with favicons and full title previews on hover.
-   **Bilingual Support**: Instantly switch between English and Russian via the popup’s language buttons.
-   **Modern Dark Theme**: A sleek, eye-friendly design suitable for any environment.

</details>

<details>
<summary>🔍 Advanced Functionality</summary>

-   **Persistent & Synced Settings**: Core preferences sync across devices using your Chrome account.
-   **Safe Handling**: Automatically ignores Chrome system pages (`chrome://`) and other extensions to prevent conflicts.
-   **Error Recovery**: Intelligently handles closed tabs by clearing their status and automatically updating muting rules.

</details>

---

## 📖 Usage Guide

1.  **Open the Popup**
    -   Click the Superior Tab Mute icon in Chrome’s toolbar to access the control panel.

2.  **Select a Mode**
    -   Choose your desired muting strategy: **Active Tab**, **First Sound**, or **Whitelist** mode using the radio buttons.
    -   For "First Sound" or "Whitelist" modes, use the tab list to select your audio source. You can enable “Show all tabs” for more options.

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
-   **`mode`** ('active', 'first-sound', 'whitelist'): Defines the active muting mode.
-   **`isAllMuted`** (true/false): Toggles the global mute state for all tabs.
-   *Purpose*: Ensures your core preferences are consistent across all your devices.

</details>

<details>
<summary>Session Storage (chrome.storage.session)</summary>

-   Temporary settings that are cleared when the browser is closed.
-   **`firstAudibleTabId`** (tab ID): Tracks the designated audio source tab in "First Sound Mode".
-   **`whitelistedTabId`** (tab ID): Tracks the user-selected tab in "Whitelist Mode".
-   *Purpose*: Tab IDs are unique to each browser session and would be invalid across devices or after a restart, making session storage the ideal choice.

</details>

<details>
<summary>Local Storage (localStorage)</summary>

-   Settings that are persistent on the device but are not synced across accounts.
-   **`stm_lang`** ('en'/'ru'): Remembers the language preference for the interface.
-   **`showAllTabsFirstSound`** ('true'/'false'): Remembers the "Show all tabs" checkbox state for First Sound Mode.
-   **`showAllTabsWhitelist`** ('true'/'false'): Remembers the "Show all tabs" checkbox state for Whitelist Mode.
-   *Purpose*: Allows for device-specific UI preferences, such as having different settings on your work and home computers.

</details>

---

## 📁 File Structure

```
Superior_Tab_Mute/
├── 📑 manifest.json         # Extension configuration and permissions
├── 🔧 background.js         # Core muting logic and event handling
├── ⚙️ popup.html            # The structure of the user interface
├── ⚙️ popup.js              # UI logic and user interactions
├── 🎨 popup.css             # Modern dark theme styling
├── 🗁 icons/                # Extension status icons
│   ├── 🖼️ icon16.png           # Default state
│   ├── 🖼️ icon16_mute.png      # All tabs muted state
│   ├── 🖼️ icon16_off.png       # Disabled state
│   ├── 🖼️ icon48.png           # Default state
│   ├── 🖼️ icon48_mute.png      # All tabs muted state
│   ├── 🖼️ icon48_off.png       # Disabled state
│   ├── 🖼️ icon128.png          # Default state
│   ├── 🖼️ icon128_mute.png     # All tabs muted state
│   └── 🖼️ icon128_off.png      # Disabled state
└── 🖺 README.md             # This documentation
```

---

<div align="center">
  
  **Made with ❤️ by badrenton**
  
  *© 2025 • If you find this extension helpful, please consider giving it a ⭐ on GitHub!*
  
</div>
