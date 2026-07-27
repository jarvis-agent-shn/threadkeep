// js/popup.js — Popup UI logic.
'use strict';

(function () {
  const els = {
    form: document.getElementById('export-form'),
    exportBtn: document.getElementById('export-btn'),
    formatMarkdown: document.getElementById('format-markdown'),
    formatJson: document.getElementById('format-json'),
    jsonHint: document.getElementById('json-pro-hint'),
    saveToLibrary: document.getElementById('save-to-library'),
    downloadFile: document.getElementById('download-file'),
    status: document.getElementById('status'),
    search: document.getElementById('search'),
    list: document.getElementById('chat-list'),
    emptyState: document.getElementById('empty-state'),
    openOptions: document.getElementById('open-options'),
    upgradeLink: document.getElementById('upgrade-link'),
    planBadge: document.getElementById('plan-badge'),
  };

  let isProUser = false;
  let searchTimer = null;

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }

  function slug(text) {
    const s = (text || 'chat')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '')
      .slice(0, 60);
    return s || 'chat';
  }

  function dateSlug() {
    return new Date().toISOString().slice(0, 10);
  }

  function setStatus(text, kind) {
    els.status.textContent = text || '';
    els.status.className = 'status status-' + (kind || 'info');
  }

  function setBusy(busy) {
    els.exportBtn.disabled = busy;
    els.exportBtn.textContent = busy ? 'Exporting…' : 'Export this chat';
  }

  function reflectProUI() {
    els.planBadge.textContent = isProUser ? 'Pro' : 'Free';
    els.planBadge.classList.toggle('badge-pro', isProUser);
    els.jsonHint.hidden = isProUser;
    if (!isProUser && els.formatJson.checked) {
      els.formatMarkdown.checked = true;
    }
  }

  async function refreshLibrary() {
    const query = els.search.value;
    const chats = query
      ? await self.TK.Store.searchChats(query, { fullText: isProUser })
      : await self.TK.Store.getAllChats();
    renderList(chats);
  }

  function renderList(chats) {
    els.list.innerHTML = '';
    const hasAny = chats.length > 0;
    els.emptyState.hidden = hasAny;
    els.list.hidden = !hasAny;
    if (!hasAny) return;

    const frag = document.createDocumentFragment();
    for (const chat of chats) frag.appendChild(renderChatItem(chat));
    els.list.appendChild(frag);
  }

  function makeActionBtn(label, action, disabledTitle) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-btn';
    b.textContent = label;
    b.dataset.action = action;
    if (disabledTitle) {
      b.disabled = true;
      b.title = disabledTitle;
    }
    return b;
  }

  function renderChatItem(chat) {
    const li = document.createElement('li');
    li.className = 'chat-item';
    li.dataset.id = chat.id;

    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'chat-title';
    title.textContent = chat.title;
    title.dataset.action = 'toggle';
    li.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'chat-sub';
    const site = self.TK.Scraper.SITE_LABELS[chat.site] || chat.site;
    sub.textContent = site + ' · ' + new Date(chat.updatedAt).toLocaleDateString() + ' · ' + chat.messageCount + ' msgs';
    li.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'chat-actions';
    actions.appendChild(makeActionBtn('Markdown', 'export-md'));
    actions.appendChild(makeActionBtn('JSON', 'export-json', isProUser ? null : 'Pro feature — upgrade to export as JSON'));
    actions.appendChild(makeActionBtn('Delete', 'delete'));
    li.appendChild(actions);

    const preview = document.createElement('div');
    preview.className = 'chat-preview';
    preview.hidden = true;
    li.appendChild(preview);

    return li;
  }

  async function downloadConversationLike(chatOrConversation, format) {
    if (format === 'json') {
      const check = await self.TK.Limits.canExportJSON();
      if (!check.allowed) return { ok: false, error: check.reason };
    }
    const content =
      format === 'json' ? self.TK.Scraper.toJSON(chatOrConversation) : self.TK.Scraper.toMarkdown(chatOrConversation);
    const ext = format === 'json' ? 'json' : 'md';
    const mime = format === 'json' ? 'application/json' : 'text/markdown';
    const filename = 'threadkeep/' + slug(chatOrConversation.title) + '-' + dateSlug() + '.' + ext;
    return sendMessage({ type: 'TK_DOWNLOAD', filename, content, mime });
  }

  async function onExportSubmit(e) {
    e.preventDefault();
    const wantJson = els.formatJson.checked && isProUser;
    const format = wantJson ? 'json' : 'markdown';
    const wantSave = els.saveToLibrary.checked;
    const wantDownload = els.downloadFile.checked;

    if (!wantSave && !wantDownload) {
      setStatus('Choose at least one: Save to library or Download file.', 'error');
      return;
    }

    setBusy(true);
    setStatus('Reading the current tab…', 'info');

    const response = await sendMessage({ type: 'TK_EXTRACT' });
    if (!response || !response.ok) {
      setStatus((response && response.error) || 'Could not read this page.', 'error');
      setBusy(false);
      return;
    }

    const conversation = response.conversation;
    if (!conversation.messages || conversation.messages.length === 0) {
      setStatus('No conversation content found. Try selecting some text on the page and exporting again.', 'error');
      setBusy(false);
      return;
    }

    const notes = [];
    let allOk = true;

    if (wantSave) {
      const check = await self.TK.Limits.canSaveToLibrary();
      if (check.allowed) {
        await self.TK.Store.addChat(conversation);
        await refreshLibrary();
        notes.push('Saved to library.');
      } else {
        allOk = false;
        notes.push('Not saved: ' + check.reason);
      }
    }

    if (wantDownload) {
      const dl = await downloadConversationLike(conversation, format);
      if (dl && dl.ok) {
        notes.push('Downloaded.');
      } else {
        allOk = false;
        notes.push('Not downloaded: ' + ((dl && dl.error) || 'unknown error'));
      }
    }

    if (conversation.usedFallback) {
      notes.push('(Used generic fallback extraction — site not specifically recognized, or exported your text selection.)');
    }

    setBusy(false);
    setStatus(notes.join(' '), allOk ? 'success' : 'warning');
  }

  async function onListClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const li = btn.closest('.chat-item');
    const id = li && li.dataset.id;
    if (!id) return;
    const action = btn.dataset.action;

    if (action === 'toggle') {
      const preview = li.querySelector('.chat-preview');
      const willShow = preview.hidden;
      if (willShow && !preview.dataset.loaded) {
        const chat = await self.TK.Store.getChat(id);
        const lines = (chat.messages || [])
          .slice(0, 8)
          .map((m) => '[' + m.role + '] ' + (m.text || '').slice(0, 160));
        preview.textContent = lines.join('\n\n') || '(empty)';
        preview.dataset.loaded = '1';
      }
      preview.hidden = !willShow;
      return;
    }

    if (action === 'delete') {
      if (!confirm('Delete this saved chat? This cannot be undone.')) return;
      await self.TK.Store.deleteChat(id);
      await refreshLibrary();
      setStatus('Chat deleted.', 'info');
      return;
    }

    if (action === 'export-md' || action === 'export-json') {
      const format = action === 'export-json' ? 'json' : 'markdown';
      const chat = await self.TK.Store.getChat(id);
      if (!chat) return;
      const dl = await downloadConversationLike(chat, format);
      setStatus(dl && dl.ok ? 'Downloaded.' : (dl && dl.error) || 'Download failed.', dl && dl.ok ? 'success' : 'warning');
    }
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshLibrary, 150);
  }

  function wireEvents() {
    els.form.addEventListener('submit', onExportSubmit);
    els.search.addEventListener('input', onSearchInput);
    els.list.addEventListener('click', onListClick);
    els.openOptions.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    els.upgradeLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#pro') });
    });
  }

  async function init() {
    isProUser = await self.TK.Pro.isPro();
    reflectProUI();
    wireEvents();
    await refreshLibrary();
  }

  init();
})();
