// background.js — MV3 service worker.
//
// Owns everything that needs page access or the downloads API:
//   - the "export-chat" keyboard command
//   - TK_EXTRACT: on-demand chrome.scripting.executeScript injection into
//     the active tab (only ever triggered by a user gesture — toolbar
//     click or keyboard shortcut — never automatically)
//   - TK_DOWNLOAD: chrome.downloads.download()
//
// Library storage (chrome.storage.local) is handled directly by the
// popup/options pages via js/store.js — no need to round-trip through the
// service worker for that.
'use strict';

importScripts('js/pro.js', 'js/limits.js', 'js/store.js', 'js/scraper.js');

const EXPORT_COMMAND = 'export-chat';

chrome.commands.onCommand.addListener((command) => {
  if (command === EXPORT_COMMAND) {
    quickExportActiveTab().catch((err) => {
      console.error('[ThreadKeep] Quick export failed:', err);
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return undefined;

  if (message.type === 'TK_EXTRACT') {
    extractFromActiveTab().then(
      (conversation) => sendResponse({ ok: true, conversation }),
      (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
    );
    return true; // keep the message channel open for the async response
  }

  if (message.type === 'TK_DOWNLOAD') {
    downloadText(message.filename, message.content, message.mime).then(
      (result) => sendResponse(Object.assign({ ok: true }, result)),
      (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
    );
    return true;
  }

  return undefined;
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');
  return tab;
}

async function extractFromActiveTab() {
  const tab = await getActiveTab();
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['js/scraper.js'],
    });
  } catch (err) {
    throw new Error(
      "ThreadKeep can't access this page. Some pages (chrome:// pages, the Chrome Web Store, or a page that hasn't finished loading) block extensions."
    );
  }
  const result = results && results[0] && results[0].result;
  if (!result) throw new Error('Nothing could be extracted from this page.');
  return result;
}

// Service workers can have inconsistent support for URL.createObjectURL, so
// we build a data: URL instead — chrome.downloads.download() accepts one
// directly and this avoids any Blob/object-URL lifecycle issues entirely.
function toDataUrl(content, mime) {
  const base64 = btoa(unescape(encodeURIComponent(content)));
  return 'data:' + (mime || 'text/plain') + ';base64,' + base64;
}

async function downloadText(filename, content, mime) {
  if (!filename || typeof content !== 'string') throw new Error('Nothing to download.');
  const url = toDataUrl(content, mime);
  const downloadId = await chrome.downloads.download({ url, filename, saveAs: false });
  return { downloadId };
}

function safeFileSlug(text) {
  const slug = (text || 'chat')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 60);
  return slug || 'chat';
}

function dateSlug() {
  return new Date().toISOString().slice(0, 10);
}

// Keyboard-shortcut path (Ctrl/Cmd+Shift+E): the popup isn't open, so this
// does a sensible default end-to-end — download as Markdown, and also try
// to save into the library (silently skipped if the free-tier limit is
// already reached, since there's no UI here to show an upgrade hint).
async function quickExportActiveTab() {
  const conversation = await extractFromActiveTab();
  const markdown = self.TK.Scraper.toMarkdown(conversation);
  const filename = 'threadkeep/' + safeFileSlug(conversation.title) + '-' + dateSlug() + '.md';
  await downloadText(filename, markdown, 'text/markdown');

  try {
    const check = await self.TK.Limits.canSaveToLibrary();
    if (check.allowed) {
      await self.TK.Store.addChat(conversation);
    }
  } catch (err) {
    console.warn('[ThreadKeep] Could not save quick export to library:', err);
  }
}
