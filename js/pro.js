// js/pro.js — Freemium status (stub, no real payments yet).
//
// This file is loaded as a plain classic script (via <script src> in the
// popup/options pages, and via importScripts() in the background service
// worker) so it attaches its API to the shared `self.TK` namespace instead
// of using ES module import/export.
'use strict';

self.TK = self.TK || {};

self.TK.Pro = (function () {
  const STORAGE_KEY = 'tk_pro';

  // Returns true/false. Never throws — defaults to "not Pro" on any error,
  // which is the safe failure mode for a freemium gate.
  async function isPro() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      return !!data[STORAGE_KEY];
    } catch (err) {
      console.warn('[ThreadKeep] isPro() failed, defaulting to free:', err);
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // TODO(payments): Wire up ExtensionPay (https://extensionpay.com) here
  // when ThreadKeep is ready to sell Pro. This file intentionally makes
  // NO network calls today — it only reads a cached local flag. Suggested
  // integration, following ExtensionPay's standard pattern:
  //
  //   1. Vendor js/lib/ExtPay.js into this extension (MV3 CSP forbids
  //      loading it from a remote <script src>, so it must ship locally).
  //   2. background.js:
  //        importScripts('js/lib/ExtPay.js');
  //        const extpay = ExtPay('threadkeep');
  //        extpay.startBackground();
  //   3. options.js (Pro section):
  //        const extpay = ExtPay('threadkeep');
  //        document.getElementById('upgrade-btn').addEventListener('click', () => {
  //          extpay.openPaymentPage();
  //        });
  //   4. Keep chrome.storage.local's "tk_pro" flag as a fast local cache so
  //      isPro() below stays synchronous-feeling and offline-safe:
  //        extpay.onPaid.addListener((user) => {
  //          chrome.storage.local.set({ [STORAGE_KEY]: !!user.paid });
  //        });
  //   5. On extension startup (background.js), reconcile once:
  //        const user = await extpay.getUser();
  //        await chrome.storage.local.set({ [STORAGE_KEY]: !!user.paid });
  //   6. isPro() itself can stay exactly as it is below — it just reads the
  //      cached flag that steps 4-5 keep in sync. No callers need to change.
  // ---------------------------------------------------------------------

  // Developer/testing helper ONLY. Not wired to any UI by default in a
  // shippable build — see options.html's collapsed "Developer testing"
  // panel, which should be removed (or hidden behind a flag) before the
  // Chrome Web Store submission.
  async function setProForTesting(value) {
    await chrome.storage.local.set({ [STORAGE_KEY]: !!value });
  }

  return { isPro, setProForTesting };
})();
