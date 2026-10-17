/**
 * Per-account chart preferences — namespaces localStorage keys with accountId
 * so each trading account remembers its own indicator toggles, chart theme,
 * pane heights, MA settings, etc.
 *
 * On account switch the UI reads the new account's stored prefs, giving
 * a "premium" experience where nothing resets between accounts.
 *
 * Supabase sync (cross-device) can be layered on later without changing
 * the read/write API.
 */

/* ── Key list (matches ChartScreen's existing localStorage keys) ─── */

export const PREF_KEYS = [
  "axe.chart.symbol",
  "axe.chart.timeframe",
  "axe.chart.obCount",
  "axe.chart.ifvgCount",
  "axe.chart.fvgCount",
  "axe.chart.projectionCount",
  "axe.chart.maPeriod",
  "axe.chart.maType",
  "axe.chart.indicatorFlags",
  "axe.chart.modeFlags",
  "axe.chart.futureCursorEnabled",
  "axe.chart.fibMode",
  "axe.chart.fibSwingOffset",
  "axe.chart.pinnedQuickActions",
  "axe.chart.paneOrder",
  "axe.chart.paneHeight.volume",
  "axe.chart.paneHeight.rsi",
  "axe.chart.paneHeight.macd",
  "axe-chart-theme",
  "axe-chart-grid",
] as const;

export type PrefKey = (typeof PREF_KEYS)[number];

/* ── Scoped read/write ─────────────────────────────────────────── */

function scopedKey(accountId: string | null, key: string): string {
  // If no accountId (e.g. demo mode), use the raw key (backward compat)
  if (!accountId) return key;
  return `${key}::${accountId}`;
}

/**
 * Read a preference for the given account.
 * Falls back to the un-scoped (global) value for backward compat
 * when no per-account value has been stored yet.
 */
export function readPref(
  accountId: string | null,
  key: string,
): string | null {
  if (typeof window === "undefined") return null;
  // Try account-scoped first
  if (accountId) {
    const scoped = localStorage.getItem(scopedKey(accountId, key));
    if (scoped !== null) return scoped;
  }
  // Fallback: global (un-scoped) — for first load or demo mode
  return localStorage.getItem(key);
}

/**
 * Write a preference for the given account.
 * Also writes the un-scoped key so ChartThemeSelector etc. can read it
 * without knowing the account.
 */
export function writePref(
  accountId: string | null,
  key: string,
  value: string,
): void {
  if (typeof window === "undefined") return;
  // Always write global (for backward compat + non-account-aware components)
  localStorage.setItem(key, value);
  // Write scoped if we have an account
  if (accountId) {
    localStorage.setItem(scopedKey(accountId, key), value);
  }
}

/**
 * Seed all global keys from the given account's stored prefs.
 * Call this on account switch so all components instantly read
 * the correct per-account values without needing to be refactored.
 */
export function seedGlobalsFromAccount(accountId: string): void {
  if (typeof window === "undefined") return;
  for (const key of PREF_KEYS) {
    const val = localStorage.getItem(scopedKey(accountId, key));
    if (val !== null) {
      localStorage.setItem(key, val);
    }
  }
}

/**
 * Snapshot all current global prefs into the given account's scope.
 * Useful for "adopting" the current settings when first linking an account.
 */
export function snapshotGlobalsToAccount(accountId: string): void {
  if (typeof window === "undefined") return;
  for (const key of PREF_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      localStorage.setItem(scopedKey(accountId, key), val);
    }
  }
}
