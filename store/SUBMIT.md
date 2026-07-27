# One-time Chrome Web Store listing — ThreadKeep

Item already created & package uploaded via API (id: odmaiafckfdjphfneijfjifaflbohada).
Dashboard: https://chrome.google.com/webstore/devconsole → click ThreadKeep item.
Fill the tabs below, then **Submit for review**. Future package updates are automated via API.

⚠️ Before submitting: remove the "Developer testing" toggle in options (I will strip it in a
final package update before you submit — ping me and I'll push the clean build).

## Store listing tab
- **Language:** English (United States)
- **Category:** Productivity
- **Store icon:** `icon128.png` (128×128)
- **Screenshots:** `1-hero.png`, `2-library.png`, `3-features.png` (1280×800)
- **Small promo tile:** `promo-440x280.png`
- **Summary (≤132 chars):**
  Export and save your ChatGPT, Claude & Gemini conversations to Markdown or JSON, with a searchable local library.
- **Description:**
  Your best AI conversations shouldn't vanish into an endless scroll. ThreadKeep lets you export and archive them in one click.

  ★ One-click export — save the AI chat you're viewing to clean Markdown or JSON. Headers, code blocks, and links preserved.
  ★ Works across assistants — dedicated support for ChatGPT, Claude, and Gemini, with a generic fallback so it still works elsewhere (or on your current text selection).
  ★ Searchable library — keep every saved conversation in one place and find it later by title or content.
  ★ Private by design — everything stays on your device. No accounts, no tracking, no servers. Nothing is uploaded.

  Free: export the current chat to Markdown and keep up to 10 saved chats.
  Pro (coming soon): JSON export, unlimited library, export-all, full-text search across chats, and auto-backup.

## Privacy practices tab
- **Single purpose:** Export the AI chat conversation on the page you're viewing to Markdown/JSON and keep a local searchable library of saved chats.
- **Permission justifications:**
  - storage: store the local library of saved chats and settings.
  - downloads: write the exported Markdown/JSON file to the user's computer.
  - activeTab + scripting: read the conversation on the active tab only when the user clicks export (or the shortcut). No content script, no host_permissions, no background page reading — the extraction script is injected on demand, only in response to the user's action.
- **Are you using remote code?** No.
- **Data usage:** Collects nothing — do not check any category; check the two certification boxes.
- **Privacy policy URL:** https://github.com/jarvis-agent-shn/threadkeep/blob/main/store/PRIVACY.md

## Account / Settings
- Contact email is already set + verified from the PromptVault setup (account-level, shared). Nothing to do.
