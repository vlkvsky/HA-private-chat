# Home Assistant Local Chat 💬

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A simple, private, and fully local chat integration for Home Assistant. It allows users to communicate with each other directly via the Home Assistant Dashboard.

## Features

* 🏠 **100% Local:** No cloud services, no external servers. Your data stays in your network.
* ⚡ **Real-time:** Messages appear instantly on all open dashboards using Home Assistant's event bus.
* 💾 **Persistent History:** Saves the last N messages, so the chat history is restored after a reboot.
* 👤 **User Identity:** Automatically detects the logged-in Home Assistant user.
* 🎨 **Custom Card:** Includes a clean, CSS-styled chat bubble card for Lovelace.

## Installation

### Step 1: Install the Integration (Backend)

**Via HACS (Recommended):**
1. Open HACS > Integrations > 3 dots (top right) > **Custom repositories**.
2. Add the URL of this repository.
3. Select Category: **Integration**.
4. Click **Add** and then install "Home Assistant Local Chat".

### Step 2: Setup the Frontend Card

Since this is a hybrid integration, you need to register the JavaScript card manually.

1. Locate the file `private-chat-card.js`.
2. Copy `private-chat-card.js` to your Home Assistant `config/www/` folder.
3. Go to **Settings** > **Dashboards** > **3 dots (top right)** > **Resources**.
4. Click **+ Add Resource**.
5. Enter the following details:
   * **URL:** `/local/private-chat-card.js`
   * **Resource type:** `JavaScript Module`
6. Click **Create**.

> **Note:** If you just created the `www` folder for the first time, you must restart Home Assistant.

## Usage

Add the custom card to any of your dashboards.

1. Edit your Dashboard.
2. Click **+ Add Card**.
3. Scroll down to "Manual".
4. Enter the following YAML configuration:

```yaml
type: custom:private-chat-card