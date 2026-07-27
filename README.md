# ThreadKeep — AI Chat Exporter

Export and archive your AI chat conversations (ChatGPT, Claude, Gemini, Grok,
Perplexity, Copilot) to clean Markdown or JSON, and keep a searchable local
library of saved chats. Plain vanilla JS/HTML/CSS, Manifest V3, no build
tools or dependencies.

This is **not** a prompt manager — it's for capturing and archiving
*finished* conversations you want to keep.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `threadkeep/` folder.
4. Pin the ThreadKeep icon to your toolbar.

## Using it

1. Open a chat on a supported site (or any page, for the generic fallback).
2. Click the ThreadKeep toolbar icon.
3. Choose Markdown or JSON, whether to save to your library and/or download
   a file, then click **Export this chat**.
4. Or press **Ctrl/Cmd+Shift+E** to instantly download the current chat as
   Markdown (and best-effort save it to your library) without opening the
   popup.
5. Open the full library — with rename, full-text search (Pro), and
   export-all (Pro) — from the popup's **Open full library** link, or via
   the extension's **Details → Extension options**.

## Why the permissions are minimal

`manifest.json` requests only:

```
"permissions": ["activeTab", "scripting", "storage", "downloads"]
```

There are **no `host_permissions`** and **no persistent content scripts**.
ThreadKeep never runs on a page until you take an explicit action (clicking
the toolbar icon or pressing the export shortcut). At that point it uses
`chrome.scripting.executeScript` to inject `js/scraper.js` into just the
active tab, read the conversation, and return it — then the injected code
is gone. This is why Chrome's install prompt won't show a "read your data
on all websites" warning.

## How extraction works

`js/scraper.js` is injected on demand and:

1. Detects the site from `location.hostname`.
2. Runs a **dedicated adapter** if one exists for that site (uses each
   site's own DOM hooks — see below for confidence levels).
3. Falls back to a **generic extractor** if no adapter matched (or the
   adapter found nothing): first your current text selection, otherwise the
   page's main content region, converted to Markdown-ish text with code
   fences and links preserved. This means export **always produces
   something useful**, even on unrecognized sites.
4. Returns a structured conversation object: `{ site, url, title,
   extractedAt, usedFallback, messages: [{ role, text, codeBlocks }] }`.

### Adapter confidence

| Site | Adapter | Confidence |
| --- | --- | --- |
| ChatGPT (chatgpt.com) | `adapterChatGPT` | High — uses ChatGPT's own `data-message-author-role` attribute |
| Claude (claude.ai) | `adapterClaude` | High — uses Claude's own `data-testid="user-message"` / `.font-claude-message` hooks |
| Gemini (gemini.google.com) | `adapterGemini` | High — uses Gemini's own `<user-query>` / `<model-response>` custom elements |
| Grok (grok.com, x.com/i/grok) | `adapterGrok` | Heuristic — Grok's DOM isn't publicly documented; falls back to generic extraction if selectors don't match |
| Perplexity (perplexity.ai) | `adapterPerplexity` | Heuristic — same caveat as Grok |
| Copilot (copilot.microsoft.com) | `adapterCopilot` | Heuristic — same caveat as Grok |
| Anything else | — | Generic fallback (selection or main content) |

Site DOM structures change over time; if an adapter stops matching, exports
simply fall through to the generic extractor rather than failing outright.

## Library & storage

`js/store.js` keeps all saved chats in `chrome.storage.local` under a single
`tk_library` key — nothing is ever sent over the network. Each entry:
`{ id, title, site, url, createdAt, updatedAt, messageCount, messages }`.
Titles default to the first user message and are editable from the options
page.

## Freemium (stub — no real payment yet)

`js/limits.js` centralizes all gating; `js/pro.js` exposes `isPro()` reading
a local `tk_pro` flag (default `false`). No network calls are made.

- **Free:** export the current chat to Markdown, save up to 10 chats in the
  library, title/site search.
- **Pro:** JSON export, unlimited library, bulk export-all, full-text
  cross-chat search, auto-backup (coming soon).

`js/pro.js` contains a clearly labeled `TODO(payments)` block describing how
to wire up [ExtensionPay](https://extensionpay.com) later, following its
standard integration pattern. The options page's Pro section also has a
collapsed **Developer testing** toggle to simulate Pro status locally while
building — remove it (or gate it behind a build flag) before shipping.

## Files

```
manifest.json         MV3 manifest (minimal permissions, strict CSP)
background.js         Service worker: command + message handling, injection, downloads
js/scraper.js          Injected extractor + site adapters + Markdown/JSON serializers
js/store.js             Library CRUD, search, export-all
js/limits.js            Centralized freemium limits
js/pro.js               isPro() stub + payments TODO
js/popup.js             Popup UI logic
js/options.js           Options page UI logic
popup.html/.css        Popup UI
options.html/.css      Options page UI (library + Pro section)
icons/                 16/48/128 PNG icons (generated placeholders)
assets/icon.svg        Source vector icon
```

## Before Chrome Web Store submission

- [ ] Replace the generated placeholder PNG icons in `icons/` with a
      final designed icon (source in `assets/icon.svg`).
- [ ] Capture store listing screenshots (popup export flow, library view,
      options Pro section) at the required dimensions.
- [ ] Register a real ExtensionPay product id and complete the
      `TODO(payments)` wiring in `js/pro.js` (currently a stub with no
      network calls).
- [ ] Write and host a privacy policy (can be short — the honest summary is
      "no data leaves the device except via user-initiated downloads"; the
      Chrome Web Store requires a URL to it in the listing).
- [ ] Remove or hide the "Developer testing" Pro toggle in `options.html`
      before shipping.
- [ ] Re-verify the site adapters against current DOM structures for each
      target site — especially the heuristic ones (Grok, Perplexity,
      Copilot), since none of them expose a stable/public DOM contract.
- [ ] Fill in the Chrome Web Store listing's permission justification text
      referencing the "on-demand only, no host_permissions" design above.
