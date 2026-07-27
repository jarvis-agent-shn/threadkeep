// js/options.js — Full library management + Pro section.
'use strict';

(function () {
  const els = {
    planBadge: document.getElementById('plan-badge'),
    search: document.getElementById('search'),
    searchHint: document.getElementById('search-hint'),
    emptyState: document.getElementById('empty-state'),
    list: document.getElementById('chat-list'),
    libraryStatus: document.getElementById('library-status'),
    exportAllMd: document.getElementById('export-all-md'),
    exportAllJson: document.getElementById('export-all-json'),
    upgradeBtn: document.getElementById('upgrade-btn'),
    proStatus: document.getElementById('pro-status'),
    devProToggle: document.getElementById('dev-pro-toggle'),
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

  function setLibraryStatus(text, kind) {
    els.libraryStatus.textContent = text || '';
    els.libraryStatus.className = 'status status-' + (kind || 'info');
  }

  function setProStatus(text, kind) {
    els.proStatus.textContent = text || '';
    els.proStatus.className = 'hint status-' + (kind || 'info');
  }

  function reflectProUI() {
    els.planBadge.textContent = isProUser ? 'Pro' : 'Free';
    els.planBadge.classList.toggle('badge-pro', isProUser);
    els.upgradeBtn.textContent = isProUser ? "You're on Pro" : 'Upgrade to Pro';
    els.upgradeBtn.disabled = isProUser;
    els.devProToggle.checked = isProUser;
    els.searchHint.textContent = isProUser
      ? 'Pro: searching across the full text of every saved message.'
      : 'Free: searching titles and source sites. Upgrade to Pro for full-text search.';
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

  function makeActionBtn(label, action, cls, disabledTitle) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-btn' + (cls ? ' ' + cls : '');
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

    const top = document.createElement('div');
    top.className = 'chat-item-top';

    const titleRow = document.createElement('div');
    titleRow.className = 'chat-title-row';

    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'chat-title';
    title.textContent = chat.title;
    title.dataset.action = 'toggle';
    titleRow.appendChild(title);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'icon-btn';
    renameBtn.textContent = 'Rename';
    renameBtn.dataset.action = 'rename';
    titleRow.appendChild(renameBtn);

    top.appendChild(titleRow);
    li.appendChild(top);

    const sub = document.createElement('div');
    sub.className = 'chat-sub';
    const site = self.TK.Scraper.SITE_LABELS[chat.site] || chat.site;
    sub.textContent = site + ' · ' + new Date(chat.updatedAt).toLocaleString() + ' · ' + chat.messageCount + ' messages';
    li.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'chat-actions';
    actions.appendChild(makeActionBtn('Export Markdown', 'export-md'));
    actions.appendChild(
      makeActionBtn('Export JSON', 'export-json', null, isProUser ? null : 'Pro feature — upgrade to export as JSON')
    );
    actions.appendChild(makeActionBtn('Delete', 'delete', 'chip-danger'));
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
        const lines = (chat.messages || []).map((m) => '[' + m.role + '] ' + (m.text || '').slice(0, 400));
        preview.textContent = lines.join('\n\n') || '(empty)';
        preview.dataset.loaded = '1';
      }
      preview.hidden = !willShow;
      return;
    }

    if (action === 'rename') {
      const titleRow = li.querySelector('.chat-title-row');
      const titleBtn = titleRow.querySelector('.chat-title');
      const chat = await self.TK.Store.getChat(id);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'title-input';
      input.value = chat.title;
      titleBtn.replaceWith(input);
      input.focus();
      input.select();

      const commit = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== chat.title) {
          await self.TK.Store.updateChatTitle(id, newTitle);
          await refreshLibrary();
        } else {
          input.replaceWith(titleBtn);
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        if (ev.key === 'Escape') {
          input.value = chat.title;
          input.blur();
        }
      });
      return;
    }

    if (action === 'delete') {
      if (!confirm('Delete this saved chat? This cannot be undone.')) return;
      await self.TK.Store.deleteChat(id);
      await refreshLibrary();
      setLibraryStatus('Chat deleted.', 'info');
      return;
    }

    if (action === 'export-md' || action === 'export-json') {
      const format = action === 'export-json' ? 'json' : 'markdown';
      const chat = await self.TK.Store.getChat(id);
      if (!chat) return;
      const dl = await downloadConversationLike(chat, format);
      setLibraryStatus(dl && dl.ok ? 'Downloaded.' : (dl && dl.error) || 'Download failed.', dl && dl.ok ? 'success' : 'warning');
    }
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshLibrary, 150);
  }

  async function onExportAll(format) {
    const check = await self.TK.Limits.canBulkExport();
    if (!check.allowed) {
      setLibraryStatus(check.reason, 'warning');
      return;
    }
    const data = await self.TK.Store.exportAllChats();
    if (data.count === 0) {
      setLibraryStatus('Your library is empty — nothing to export.', 'info');
      return;
    }
    let content;
    let mime;
    let ext;
    if (format === 'json') {
      content = JSON.stringify(
        { app: 'ThreadKeep', formatVersion: 1, exportedAt: data.exportedAt, count: data.count, chats: data.chats },
        null,
        2
      );
      mime = 'application/json';
      ext = 'json';
    } else {
      content = data.chats.map((c) => self.TK.Scraper.toMarkdown(c)).join('\n\n---\n\n');
      mime = 'text/markdown';
      ext = 'md';
    }
    const filename = 'threadkeep/threadkeep-library-' + dateSlug() + '.' + ext;
    const dl = await sendMessage({ type: 'TK_DOWNLOAD', filename, content, mime });
    setLibraryStatus(
      dl && dl.ok ? 'Exported ' + data.count + ' chats.' : (dl && dl.error) || 'Export failed.',
      dl && dl.ok ? 'success' : 'error'
    );
  }

  async function onUpgradeClick() {
    // Stub: no real payment flow yet. See js/pro.js for the ExtensionPay
    // wiring plan (TODO(payments)). This is intentionally honest with the
    // user rather than pretending a purchase happened.
    setProStatus('ThreadKeep Pro is coming soon. This button is a placeholder — no payment will be taken.', 'info');
  }

  async function onDevProToggle() {
    await self.TK.Pro.setProForTesting(els.devProToggle.checked);
    isProUser = await self.TK.Pro.isPro();
    reflectProUI();
    await refreshLibrary();
    setProStatus(isProUser ? 'Simulated Pro status enabled (local testing only).' : 'Simulated Pro status disabled.', 'info');
  }

  function wireEvents() {
    els.search.addEventListener('input', onSearchInput);
    els.list.addEventListener('click', onListClick);
    els.exportAllMd.addEventListener('click', () => onExportAll('markdown'));
    els.exportAllJson.addEventListener('click', () => onExportAll('json'));
    els.upgradeBtn.addEventListener('click', onUpgradeClick);
    els.devProToggle.addEventListener('change', onDevProToggle);
  }

  function scrollToHashSection() {
    if (location.hash === '#pro') {
      const el = document.getElementById('pro');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function init() {
    isProUser = await self.TK.Pro.isPro();
    reflectProUI();
    wireEvents();
    await refreshLibrary();
    scrollToHashSection();
  }

  init();
})();
