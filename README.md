# Superior Tab Mute

<div align="center">
   <img src="https://raw.githubusercontent.com/le0booba/Superior_Tab_Mute/refs/heads/main/screen-options-popup-main.png" alt="Superior Tab Mute Screenshot" width="230"/>

   **Intelligent Audio Control for Chrome**

   Stop the audio chaos. Superior Tab Mute puts you in command of your browser's soundscape, automatically silencing background tabs based on simple, powerful rules. This creates a focused environment, perfect for concentrating on work, enjoying uninterrupted music, or isolating a single stream. With its smart muting modes, instant controls, and clean design, you can finally browse in peace.

   ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
   ![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
   ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
</div>

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
-   **Global Mute**: Silence all tabs instantly (`Alt+Shift+M`).
-   **Set Sound Source**: Designate the current tab as the audio source in First Sound Mode (`Alt+Shift+E`).
-   **Show All Tabs**: View and select from all available tabs, not just audible ones, in First Sound and Whitelist modes.

### 🧠 Intelligent Automation

-   **Remember Last Source**: When enabled for "First Sound" or "Whitelist" mode, the extension maintains a history of up to 20 recently audible tabs. If your current source tab goes silent or is closed, it automatically switches to the most recent tab that was playing audio. This ensures seamless listening without manual intervention, intelligently prioritizing your listening experience.

<details>
<summary>🎨 User-Friendly Interface</summary>

-   **Dynamic Status Icons**: The extension icon changes to reflect the current state (active, muted, or disabled).
-   **Real-Time Tab List**: Displays tabs with audio or all tabs, complete with favicons and full title previews on hover.
-   **Bilingual Support**: Instantly switch between English and Russian via the popup's language buttons.
-   **Modern Dark Theme**: A sleek, eye-friendly design suitable for any environment.
-   **Tooltip Shortcuts**: Hover over controls to see assigned keyboard shortcuts for quick access.

</details>

<details>
<summary>🔍 Advanced Functionality</summary>

-   **Persistent & Synced Settings**: Core preferences sync across devices using your Chrome account.
-   **Safe Handling**: Automatically ignores Chrome system pages (`chrome://`) and other extensions to prevent conflicts.
-   **Error Recovery**: Intelligently handles closed tabs by clearing their status and automatically updating muting rules.
-   **Smart History Tracking**: Maintains a rolling history of audible tabs for intelligent source switching.
-   **Efficient Storage**: Uses appropriate storage mechanisms (sync, session, local) for different types of data.

</details>

---

## 📖 Usage Guide

1.  **Open the Popup**
    -   Click the Superior Tab Mute icon in Chrome's toolbar to access the control panel.

2.  **Select a Mode**
    -   Choose your desired muting strategy: **Active Tab**, **First Sound**, **Whitelist**, or **Mute New Tabs** mode using the radio buttons.
    -   For "First Sound" or "Whitelist" modes, use the tab list to select your audio source. You can enable "Show all tabs" for more options.
    -   When using "First Sound" or "Whitelist" modes, check the **"Remember last source"** box to enable automatic source switching. The extension will track recently audible tabs and seamlessly switch to them if your current source stops playing or closes.

3.  **Use Keyboard Shortcuts**
    -   `Alt+Shift+S`: Toggle extension on/off
    -   `Alt+Shift+M`: Toggle mute all tabs
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
-   *Purpose*: Ensures your core preferences are consistent across all your devices.

</details>

<details>
<summary>Session Storage (chrome.storage.session)</summary>

-   Temporary settings that are cleared when the browser is closed.
-   **`firstAudibleTabId`** (tab ID): Tracks the designated audio source tab in "First Sound Mode".
-   **`whitelistedTabId`** (tab ID): Tracks the user-selected tab in "Whitelist Mode".
-   **`audibleHistory`** (array of tab IDs): Keeps a rolling history of up to 20 tabs that have recently played audio, used by the "Remember Last Source" feature to intelligently switch sources.
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

## 🔧 Troubleshooting

<details>
<summary><strong>Problem: The extension isn't muting any tabs.</strong></summary>
<blockquote>

- **Check the Master Toggle**: Ensure the main toggle switch (⭘ / ⏽) in the popup is enabled (⏽).
- **Check Global Mute**: Make sure the "Mute All Tabs" switch is not overriding your selected mode.
- **Reload the Extension**: Go to `chrome://extensions/`, find Superior Tab Mute, and click the refresh icon.
- **Restart Chrome**: A simple restart can resolve temporary issues.

</blockquote>
</details>

<details>
<summary><strong>Problem: Keyboard shortcuts are not working.</strong></summary>
<blockquote>

- This is usually caused by a conflict with another extension or a Chrome internal shortcut.
- **Solution**: Navigate to `chrome://extensions/shortcuts`. Find Superior Tab Mute and check if any of its shortcuts have a conflict warning. You can re-assign the shortcut to a different key combination on this page.

</blockquote>
</details>

<details>
<summary><strong>Problem: A specific tab is not behaving as expected.</strong></summary>
<blockquote>

- **Verify the Mode**: Double-check which mode is active. The behavior depends entirely on it.
- **Re-select the Source**: In "Whitelist" or "First Sound" mode, try re-selecting the desired tab from the list. In "First Sound" mode, you can also use the **🔊 Current Tab 🠆 SOURCE** button to force an update.
- **Reload the Tab**: The specific web page might be in an unusual state. Reloading the tab (F5 or Ctrl+R) often fixes this.

</blockquote>
</details>

<details>
<summary><strong>Problem: The popup interface seems frozen or isn't updating.</strong></summary>
<blockquote>

- **Re-open the Popup**: Simply click outside the popup to close it, then click the extension icon again.
- **Reload the Extension**: If re-opening doesn't work, a full reload of the extension from `chrome://extensions/` will reset its state.

</blockquote>
</details>

<details>
<summary><strong>Problem: The "Remember Last Source" feature isn't working.</strong></summary>
<blockquote>

- **Check the Toggle**: Make sure the "Remember last source" toggle is enabled for the current mode (First Sound or Whitelist).
- **Verify History**: The feature requires at least one other tab to have played audio recently. The extension maintains a history of up to 20 recently audible tabs.
- **Test It**: Close the current source tab and see if the extension switches to another recently audible tab automatically.

</blockquote>
</details>

---

## 📁 File Structure

```
Superior_Tab_Mute/
├── 📑 manifest.json         # Extension configuration and permissions
├── 🔧 background.js         # Core muting logic and event handling
├── 🖹 popup.html            # The structure of the user interface
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
├── 📄 LICENSE.md            # MIT License
└── 📖 README.md             # This documentation
```

---

<div align="center">
   
  **Made with ❤️ by badrenton**
  
  *© 2025 • If you find this extension helpful, please consider giving it a ⭐ on GitHub!*
</div>
