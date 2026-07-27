// js/limits.js — Centralized freemium limits & gate checks.
//
// Every gate returns { allowed: boolean, reason?: string } so callers can
// show a clear "Upgrade to Pro" hint instead of failing silently.
'use strict';

self.TK = self.TK || {};

self.TK.Limits = (function () {
  const FREE_LIBRARY_MAX = 10;

  async function canSaveToLibrary() {
    const pro = await self.TK.Pro.isPro();
    if (pro) return { allowed: true };
    const count = await self.TK.Store.countChats();
    if (count >= FREE_LIBRARY_MAX) {
      return {
        allowed: false,
        reason:
          'Free plan is limited to ' +
          FREE_LIBRARY_MAX +
          ' saved chats. Upgrade to Pro for an unlimited library.',
      };
    }
    return { allowed: true };
  }

  async function canExportJSON() {
    const pro = await self.TK.Pro.isPro();
    if (!pro) {
      return { allowed: false, reason: 'JSON export is a Pro feature. Upgrade to Pro to export as JSON.' };
    }
    return { allowed: true };
  }

  async function canBulkExport() {
    const pro = await self.TK.Pro.isPro();
    if (!pro) {
      return {
        allowed: false,
        reason: 'Bulk export-all is a Pro feature. Upgrade to Pro to export your whole library at once.',
      };
    }
    return { allowed: true };
  }

  // Free users can still search their (small) library by title/site.
  // Pro users get full-text search across every saved message.
  async function canCrossChatSearch() {
    const pro = await self.TK.Pro.isPro();
    return { allowed: true, fullText: !!pro };
  }

  // Auto-backup is a "coming soon" Pro feature — no implementation yet,
  // this just centralizes the gate + messaging for when it ships.
  async function canAutoBackup() {
    const pro = await self.TK.Pro.isPro();
    if (!pro) {
      return { allowed: false, reason: 'Auto-backup is a Pro feature (coming soon). Upgrade to Pro to get early access.' };
    }
    return { allowed: false, reason: 'Auto-backup is coming soon for Pro users.' };
  }

  return {
    FREE_LIBRARY_MAX,
    canSaveToLibrary,
    canExportJSON,
    canBulkExport,
    canCrossChatSearch,
    canAutoBackup,
  };
})();
