// js/scraper.js — Page extraction + Markdown/JSON serializers.
//
// This file has two lives:
//
//  1. Injected on demand into the active tab via
//     chrome.scripting.executeScript({ files: ['js/scraper.js'] }), always
//     triggered by a user gesture (toolbar click or keyboard command) —
//     never a persistent content script. When run this way, the last
//     statement's value becomes the executeScript() result, so this file
//     ends with a bare expression that resolves to the extracted
//     conversation object.
//
//  2. Loaded as a normal <script src="js/scraper.js"> in popup.html /
//     options.html so the popup/options UI can reuse the same
//     toMarkdown()/toJSON() serializers when re-exporting chats that are
//     already saved in the library (no page access needed for that path).
//
// In case 2 we must NOT run the page-extraction logic (there is no chat
// page to read — we're inside the extension's own popup/options document),
// so the auto-run at the bottom is guarded by checking location.protocol.
'use strict';

self.TK = self.TK || {};

self.TK.Scraper = (function () {
  // ---------------------------------------------------------------------
  // Site detection
  // ---------------------------------------------------------------------
  function detectSite() {
    const h = location.hostname;
    const p = location.pathname;
    if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
    if (h.includes('claude.ai')) return 'claude';
    if (h.includes('gemini.google.com')) return 'gemini';
    if (h.includes('grok.com')) return 'grok';
    if (h.includes('x.com') && p.includes('/i/grok')) return 'grok';
    if (h.includes('perplexity.ai')) return 'perplexity';
    if (h.includes('copilot.microsoft.com')) return 'copilot';
    return null;
  }

  const SITE_LABELS = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    grok: 'Grok',
    perplexity: 'Perplexity',
    copilot: 'Copilot',
    unknown: 'Unknown site',
  };

  // ---------------------------------------------------------------------
  // Shared DOM -> Markdown-ish text conversion (used by every adapter).
  // Deliberately uses textContent (not innerText) so it works reliably on
  // cloned/detached nodes across Chrome versions, and manually inserts
  // line breaks at common block-level tags to approximate paragraphs.
  // ---------------------------------------------------------------------
  const BLOCK_TAGS = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TR', 'SECTION', 'ARTICLE'];

  function extractContent(root) {
    if (!root) return { text: '', codeBlocks: [] };
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());

    // 1) Pull out <pre> code blocks first and replace with placeholders so
    //    their formatting survives the later block-spacing / text pass.
    const codeBlocks = [];
    clone.querySelectorAll('pre').forEach((pre, i) => {
      const codeEl = pre.querySelector('code') || pre;
      const langMatch = (codeEl.className || '').match(/language-([\w-]+)/);
      const lang = langMatch ? langMatch[1] : '';
      const code = (codeEl.textContent || '').replace(/\n+$/, '');
      codeBlocks.push({ lang, code });
      pre.replaceWith(document.createTextNode('\n[[TK_CODE_BLOCK_' + i + ']]\n'));
    });

    // 2) Convert links to inline Markdown before we flatten to text.
    clone.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const label = (a.textContent || '').trim() || href;
      if (href && !href.startsWith('javascript:')) {
        a.replaceWith(document.createTextNode('[' + label + '](' + href + ')'));
      }
    });

    // 3) Prefix list items with a bullet.
    clone.querySelectorAll('li').forEach((li) => {
      li.prepend(document.createTextNode('- '));
    });

    // 4) Turn <br> into real line breaks.
    clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));

    // 5) Add a trailing newline after common block-level elements.
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    const blockNodes = [];
    let node = walker.currentNode;
    while (node) {
      if (BLOCK_TAGS.indexOf(node.tagName) !== -1) blockNodes.push(node);
      node = walker.nextNode();
    }
    blockNodes.forEach((n) => n.append(document.createTextNode('\n')));

    // 6) Flatten to text and restore code fences.
    let text = clone.textContent || '';
    codeBlocks.forEach((cb, i) => {
      const fence = '```' + (cb.lang || '') + '\n' + cb.code + '\n```';
      text = text.replace('[[TK_CODE_BLOCK_' + i + ']]', fence);
    });

    // 7) Tidy whitespace: trim trailing spaces per line, collapse 3+
    //    blank lines down to a single blank line.
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { text, codeBlocks };
  }

  function firstMatch(root, selectors) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (e) {
        /* invalid selector on this browser — skip */
      }
    }
    return null;
  }

  function queryAllMatches(selectors) {
    for (const sel of selectors) {
      try {
        const nodes = document.querySelectorAll(sel);
        if (nodes.length) return Array.from(nodes);
      } catch (e) {
        /* skip */
      }
    }
    return [];
  }

  function pushMessage(list, role, root) {
    const { text, codeBlocks } = extractContent(root);
    if (!text) return;
    list.push({ role, text, codeBlocks });
  }

  // ---------------------------------------------------------------------
  // Site adapters
  //
  // Confidence varies by site — ChatGPT, Claude and Gemini expose fairly
  // stable, well-documented DOM hooks (data-message-author-role,
  // data-testid, dedicated custom elements). Grok, Perplexity and Copilot
  // don't publish a stable DOM contract, so those adapters are best-effort
  // heuristics: if their selectors don't match anything, they simply
  // return [] and extraction falls through to the generic fallback below,
  // which always produces *something* useful.
  // ---------------------------------------------------------------------

  // High confidence: data-message-author-role is ChatGPT's own hook.
  function adapterChatGPT() {
    const nodes = document.querySelectorAll('[data-message-author-role]');
    const out = [];
    nodes.forEach((n) => {
      const role = n.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
      const contentRoot = firstMatch(n, ['.markdown', '[data-message-id] .markdown']) || n;
      pushMessage(out, role, contentRoot);
    });
    return out;
  }

  // High confidence: data-testid="user-message" is Claude's own hook for
  // user turns; assistant turns render into .font-claude-message.
  function adapterClaude() {
    const nodes = document.querySelectorAll('[data-testid="user-message"], .font-claude-message');
    const out = [];
    nodes.forEach((n) => {
      const role = n.matches('[data-testid="user-message"]') ? 'user' : 'assistant';
      pushMessage(out, role, n);
    });
    return out;
  }

  // High confidence: <user-query> / <model-response> are Gemini's own
  // custom elements.
  function adapterGemini() {
    const nodes = document.querySelectorAll('user-query, model-response');
    const out = [];
    nodes.forEach((n) => {
      const role = n.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant';
      pushMessage(out, role, n);
    });
    return out;
  }

  // Heuristic (Grok's DOM is not publicly documented / changes often).
  // Tries a few plausible attribute patterns; returns [] to fall back to
  // the generic extractor if none match.
  function adapterGrok() {
    const userNodes = queryAllMatches(['[data-testid*="user"] [dir="auto"]', '[data-message-author-role="user"]']);
    const assistantNodes = queryAllMatches(['[data-testid*="assistant"] .prose', '[data-message-author-role="assistant"]']);
    if (!userNodes.length && !assistantNodes.length) return [];
    const tagged = [
      ...userNodes.map((n) => ({ n, role: 'user' })),
      ...assistantNodes.map((n) => ({ n, role: 'assistant' })),
    ];
    tagged.sort((a, b) => (a.n.compareDocumentPosition(b.n) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const out = [];
    tagged.forEach(({ n, role }) => pushMessage(out, role, n));
    return out;
  }

  // Heuristic (Perplexity's DOM is not publicly documented).
  function adapterPerplexity() {
    const nodes = queryAllMatches(['[data-testid="query-text"]', 'h1.group\\/query']);
    const answers = queryAllMatches(['.prose', '[data-testid="answer-content"]']);
    if (!nodes.length && !answers.length) return [];
    const tagged = [
      ...nodes.map((n) => ({ n, role: 'user' })),
      ...answers.map((n) => ({ n, role: 'assistant' })),
    ];
    tagged.sort((a, b) => (a.n.compareDocumentPosition(b.n) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const out = [];
    tagged.forEach(({ n, role }) => pushMessage(out, role, n));
    return out;
  }

  // Heuristic (Copilot's DOM is not publicly documented).
  function adapterCopilot() {
    const nodes = queryAllMatches(['[data-content="user-message"]', '[data-testid="user-message"]']);
    const answers = queryAllMatches(['[data-content="ai-message"]', '[data-testid="bot-message"]']);
    if (!nodes.length && !answers.length) return [];
    const tagged = [
      ...nodes.map((n) => ({ n, role: 'user' })),
      ...answers.map((n) => ({ n, role: 'assistant' })),
    ];
    tagged.sort((a, b) => (a.n.compareDocumentPosition(b.n) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const out = [];
    tagged.forEach(({ n, role }) => pushMessage(out, role, n));
    return out;
  }

  const ADAPTERS = {
    chatgpt: adapterChatGPT,
    claude: adapterClaude,
    gemini: adapterGemini,
    grok: adapterGrok,
    perplexity: adapterPerplexity,
    copilot: adapterCopilot,
  };

  // ---------------------------------------------------------------------
  // Generic fallback — always produces *something* useful:
  //   1) the user's current text selection, if any, or else
  //   2) the page's main content region, converted to Markdown-ish text.
  // Never throws; returns [] only if the page truly has no readable text.
  // ---------------------------------------------------------------------
  function extractGeneric() {
    const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
    const selectedText = selection && selection.toString ? selection.toString().trim() : '';
    if (selectedText.length > 0) {
      return [{ role: 'selection', text: selectedText, codeBlocks: [] }];
    }

    const container = firstMatch(document, ['main', '[role="main"]', 'article', '#content', 'body']);
    if (!container) return [];
    const { text, codeBlocks } = extractContent(container);
    if (!text) return [];
    return [{ role: 'content', text, codeBlocks }];
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------
  function run() {
    let site = null;
    let messages = [];
    let usedFallback = false;

    try {
      site = detectSite();
    } catch (e) {
      site = null;
    }

    try {
      if (site && ADAPTERS[site]) {
        messages = ADAPTERS[site]() || [];
      }
    } catch (e) {
      messages = [];
    }

    if (!messages || messages.length === 0) {
      usedFallback = true;
      try {
        messages = extractGeneric();
      } catch (e) {
        messages = [];
      }
    }

    return {
      site: site || 'unknown',
      siteLabel: SITE_LABELS[site || 'unknown'],
      url: location.href,
      title: (document.title || '').trim() || 'Untitled chat',
      extractedAt: new Date().toISOString(),
      usedFallback,
      messages,
    };
  }

  // ---------------------------------------------------------------------
  // Serializers — reused both right after extraction and later when
  // re-exporting a chat already saved in the library.
  // ---------------------------------------------------------------------
  function roleHeading(role) {
    if (role === 'user') return 'User';
    if (role === 'assistant') return 'Assistant';
    if (role === 'selection') return 'Selected text';
    if (role === 'content') return 'Page content';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  function toMarkdown(conversation) {
    const c = conversation || {};
    const messages = Array.isArray(c.messages) ? c.messages : [];
    const when = c.extractedAt || (c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString());
    const lines = [];
    lines.push('# ' + (c.title || 'Untitled chat'));
    lines.push('');
    lines.push('- Source: ' + (SITE_LABELS[c.site] || c.site || 'unknown'));
    if (c.url) lines.push('- URL: ' + c.url);
    lines.push('- Exported: ' + when);
    lines.push('- Messages: ' + messages.length);
    if (c.usedFallback) lines.push('- Note: extracted with generic fallback (site not specifically recognized, or selection-only export).');
    lines.push('');
    lines.push('---');
    for (const m of messages) {
      lines.push('');
      lines.push('## ' + roleHeading(m.role));
      lines.push('');
      lines.push(m.text || '');
    }
    lines.push('');
    return lines.join('\n');
  }

  function toJSON(conversation) {
    const c = conversation || {};
    const payload = {
      app: 'ThreadKeep',
      formatVersion: 1,
      title: c.title || 'Untitled chat',
      site: c.site || 'unknown',
      url: c.url || '',
      exportedAt: c.extractedAt || new Date().toISOString(),
      usedFallback: !!c.usedFallback,
      messageCount: (c.messages || []).length,
      messages: (c.messages || []).map((m) => ({
        role: m.role,
        text: m.text,
        codeBlocks: m.codeBlocks || [],
      })),
    };
    return JSON.stringify(payload, null, 2);
  }

  return { detectSite, run, toMarkdown, toJSON, SITE_LABELS };
})();

// ---------------------------------------------------------------------
// Auto-run only when injected into an actual page via
// chrome.scripting.executeScript({ files: ['js/scraper.js'] }). When this
// file is instead loaded as <script src> inside the extension's own
// popup.html/options.html (protocol "chrome-extension:"), skip running the
// extractor — those pages only need the serializer functions above.
// ---------------------------------------------------------------------
if (typeof location !== 'undefined' && location.protocol !== 'chrome-extension:') {
  // NOTE: this IIFE must explicitly `return` its value. When a file is
  // injected via chrome.scripting.executeScript({ files: [...] }), the
  // reported result is the *completion value* of the file's last top-level
  // statement (like eval) — and the completion value of a function-call
  // expression statement is whatever that function returns, NOT whatever
  // its inner statements' completion values were. Without an explicit
  // `return`, this would silently report `undefined` to background.js.
  (function () {
    let result;
    try {
      result = self.TK.Scraper.run();
    } catch (err) {
      result = {
        site: 'unknown',
        siteLabel: 'Unknown site',
        url: location.href,
        title: (document.title || '').trim() || 'Untitled chat',
        extractedAt: new Date().toISOString(),
        usedFallback: true,
        error: String((err && err.message) || err),
        messages: [],
      };
    }
    return result;
  })();
}
