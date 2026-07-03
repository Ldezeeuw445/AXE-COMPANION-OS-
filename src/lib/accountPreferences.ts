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

/** Per-account only (theme, grid — not symbol-specific). */
export const ACCOUNT_PREF_KEYS = [
  "axe-chart-theme",
  "axe-chart-grid",
] as const;

/** Per account + symbol (indicators, SMC tools, pane layout). */
export const SYMBOL_PREF_KEYS = [
  "axe.chart.obCount",
  "axe.chart.ifvgCount",
  "axe.chart.fvgCount",
  "axe.chart.projectionCount",
  "axe.chart.maPeriod",
  "axe.chart.maType",
  "axe.chart.indicatorFlags",
  "axe.chart.smcFlags",
  "axe.chart.fibMode",
  "axe.chart.fibSwingOffset",
  "axe.chart.paneHeight.volume",
  "axe.chart.paneHeight.rsi",
  "axe.chart.paneHeight.macd",
  "axe.chart.paneOrder",
] as const;

export const PREF_KEYS = [...ACCOUNT_PREF_KEYS, ...SYMBOL_PREF_KEYS] as const;

export type PrefKey = (typeof PREF_KEYS)[number];

/* ── Scoped read/write ─────────────────────────────────────────── */

function scopedKey(accountId: string | null, key: string): string {
  // If no accountId (e.g. demo mode), use the raw key (backward compat)
  if (!accountId) return key;
  return `${key}::${accountId}`;
}

function symbolScopedKey(accountId: string | null, symbol: string, key: string): string {
  const sym = symbol.trim().toUpperCase();
  if (!accountId) return `${key}::${sym}`;
  return `${key}::${accountId}::${sym}`;
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
  for (const key of ACCOUNT_PREF_KEYS) {
    const val = localStorage.getItem(scopedKey(accountId, key));
    if (val !== null) {
      localStorage.setItem(key, val);
    }
  }
}

/**
 * Read a per-symbol chart preference. Falls back to account-scoped, then global.
 */
export function readSymbolPref(
  accountId: string | null,
  symbol: string,
  key: string,
): string | null {
  if (typeof window === "undefined") return null;
  const symVal = localStorage.getItem(symbolScopedKey(accountId, symbol, key));
  if (symVal !== null) return symVal;
  if (accountId) {
    const acctVal = localStorage.getItem(scopedKey(accountId, key));
    if (acctVal !== null) return acctVal;
  }
  return localStorage.getItem(key);
}

/**
 * Write a per-symbol chart preference and mirror to global for live reads.
 */
export function writeSymbolPref(
  accountId: string | null,
  symbol: string,
  key: string,
  value: string,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(symbolScopedKey(accountId, symbol, key), value);
  localStorage.setItem(key, value);
}

/**
 * Seed global chart keys from the given account + symbol scope.
 * Call on symbol or account switch so downstream reads stay in sync.
 */
export function seedGlobalsFromSymbol(accountId: string | null, symbol: string): void {
  if (typeof window === "undefined") return;
  for (const key of SYMBOL_PREF_KEYS) {
    const val = readSymbolPref(accountId, symbol, key);
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
  for (const key of ACCOUNT_PREF_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      localStorage.setItem(scopedKey(accountId, key), val);
    }
  }
}

export function snapshotGlobalsToSymbol(accountId: string | null, symbol: string): void {
  if (typeof window === "undefined") return;
  for (const key of SYMBOL_PREF_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      localStorage.setItem(symbolScopedKey(accountId, symbol, key), val);
    }
  }
}
