// js/store.js — Local library CRUD (chrome.storage.local only, no network).
'use strict';

self.TK = self.TK || {};

self.TK.Store = (function () {
  const KEY = 'tk_library';

  function uid() {
    return 'tk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  async function _readAll() {
    const data = await chrome.storage.local.get(KEY);
    return Array.isArray(data[KEY]) ? data[KEY] : [];
  }

  async function _writeAll(list) {
    await chrome.storage.local.set({ [KEY]: list });
  }

  async function getAllChats() {
    const list = await _readAll();
    return list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function getChat(id) {
    const list = await _readAll();
    return list.find((c) => c.id === id) || null;
  }

  async function countChats() {
    const list = await _readAll();
    return list.length;
  }

  function deriveTitle(messages) {
    const list = Array.isArray(messages) ? messages : [];
    const firstUser = list.find((m) => m.role === 'user' && m.text && m.text.trim());
    const source = (firstUser && firstUser.text) || (list[0] && list[0].text) || 'Untitled chat';
    const oneLine = source.replace(/\s+/g, ' ').trim();
    if (!oneLine) return 'Untitled chat';
    return oneLine.length > 80 ? oneLine.slice(0, 77) + '…' : oneLine;
  }

  // `conversation` is the object produced by js/scraper.js:
  // { site, url, title, extractedAt, usedFallback, messages }
  async function addChat(conversation) {
    const list = await _readAll();
    const now = Date.now();
    const messages = Array.isArray(conversation && conversation.messages) ? conversation.messages : [];
    const chat = {
      id: uid(),
      title: deriveTitle(messages),
      site: (conversation && conversation.site) || 'unknown',
      url: (conversation && conversation.url) || '',
      createdAt: now,
      updatedAt: now,
      messageCount: messages.length,
      messages,
    };
    list.push(chat);
    await _writeAll(list);
    return chat;
  }

  async function updateChatTitle(id, title) {
    const list = await _readAll();
    const chat = list.find((c) => c.id === id);
    if (!chat) throw new Error('Chat not found.');
    const trimmed = (title || '').trim();
    chat.title = trimmed || chat.title;
    chat.updatedAt = Date.now();
    await _writeAll(list);
    return chat;
  }

  async function deleteChat(id) {
    const list = await _readAll();
    const next = list.filter((c) => c.id !== id);
    await _writeAll(next);
    return next.length !== list.length;
  }

  async function clearAll() {
    await _writeAll([]);
  }

  // opts.fullText: when true (Pro), also search message bodies, not just
  // title/site. Free users get title + site search only.
  async function searchChats(query, opts) {
    const q = (query || '').trim().toLowerCase();
    const list = await getAllChats();
    if (!q) return list;
    const fullText = !!(opts && opts.fullText);
    return list.filter((c) => {
      if (c.title && c.title.toLowerCase().includes(q)) return true;
      if (c.site && c.site.toLowerCase().includes(q)) return true;
      if (fullText) {
        return (c.messages || []).some((m) => m.text && m.text.toLowerCase().includes(q));
      }
      return false;
    });
  }

  async function exportAllChats() {
    const list = await getAllChats();
    return { exportedAt: new Date().toISOString(), count: list.length, chats: list };
  }

  return {
    getAllChats,
    getChat,
    countChats,
    addChat,
    updateChatTitle,
    deleteChat,
    clearAll,
    searchChats,
    exportAllChats,
  };
})();
