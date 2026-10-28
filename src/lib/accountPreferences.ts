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

import {
  ANY_SCOPE,
  accountScope,
  isSyncedKey,
  scopeId,
  symbolScope,
  type ChartPrefRow,
} from "@/lib/chart/chartPrefs";

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
  "axe.chart.paneHeight.stoch",
  "axe.chart.paneHeight.adx",
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

/* ── Supabase sync ────────────────────────────────────────────────────────
   "Supabase sync (cross-device) can be layered on later without changing the
   read/write API" is what the header of this file promised. This is that
   layer, and the read/write API above is unchanged: every write still lands
   in localStorage first and synchronously, so the chart never waits on a
   network call to draw. The server is a second home, not the source.

   Why it exists at all is in `@/lib/chart/chartPrefs`: a new phone used to
   start from nothing, Companion and Trading OS shared nothing about how the
   trader reads a chart, and AXE could not see any of it — which is why it
   used to claim "RSI, MACD, MA" for everyone from a constant in the source.
   ───────────────────────────────────────────────────────────────────────── */

/** When this device last wrote a scope. Local, so a merge has two sides. */
const STAMP_PREFIX = "axe.chart.syncedAt";

function stampKey(accountKey: string, symbolKey: string): string {
  return `${STAMP_PREFIX}::${accountKey}::${symbolKey}`;
}

function readStamp(accountKey: string, symbolKey: string): string | null {
  try {
    return localStorage.getItem(stampKey(accountKey, symbolKey));
  } catch {
    return null;
  }
}

/**
 * Everything this device holds for one scope, in the shape the server takes.
 *
 * Reads the scoped keys directly rather than through `readPref`, which falls
 * back to the global value: a fallback is right for drawing a chart and wrong
 * for syncing, because it would upload another scope's values as if this
 * scope had them.
 */
function localScope(accountId: string | null, symbol: string | null): ChartPrefRow | null {
  if (typeof window === "undefined") return null;
  const accountKey = accountScope(accountId);
  const symbolKey = symbolScope(symbol);
  const keys = symbolKey === ANY_SCOPE ? ACCOUNT_PREF_KEYS : SYMBOL_PREF_KEYS;

  const prefs: Record<string, string> = {};
  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw =
        symbolKey === ANY_SCOPE
          ? localStorage.getItem(scopedKey(accountId, key))
          : localStorage.getItem(symbolScopedKey(accountId, symbol ?? "", key));
    } catch {
      // Private mode, blocked storage. Nothing to sync, and not an error.
      return null;
    }
    if (raw !== null && isSyncedKey(key)) prefs[key] = raw;
  }
  if (Object.keys(prefs).length === 0) return null;
  return {
    accountKey,
    symbolKey,
    prefs,
    updatedAt: readStamp(accountKey, symbolKey) ?? new Date(0).toISOString(),
  };
}

/** Write a server scope into localStorage, scoped and global, as the app reads it. */
function applyScope(row: ChartPrefRow): void {
  const accountId = row.accountKey === ANY_SCOPE ? null : row.accountKey;
  const symbol = row.symbolKey === ANY_SCOPE ? null : row.symbolKey;
  for (const [key, value] of Object.entries(row.prefs)) {
    if (!isSyncedKey(key)) continue;
    try {
      if (symbol === null) writePref(accountId, key, value);
      else writeSymbolPref(accountId, symbol, key, value);
    } catch {
      return;
    }
  }
  try {
    localStorage.setItem(stampKey(row.accountKey, row.symbolKey), row.updatedAt);
  } catch {
    // Nothing to do: the values are applied, only the stamp is lost, and a
    // lost stamp makes the next merge prefer the server. Safe either way.
  }
}

/**
 * Pull the trader's saved setup and adopt anything newer than this device's.
 *
 * Returns the scopes that were adopted, so a caller can re-read its state.
 * Never throws: a failed sync has to leave the chart exactly as it was.
 */
export async function pullChartPrefs(): Promise<ChartPrefRow[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/preferences/chart", { credentials: "include" });
    if (!res.ok) return [];
    const body = (await res.json()) as { scopes?: ChartPrefRow[] };
    const scopes = Array.isArray(body.scopes) ? body.scopes : [];

    const adopted: ChartPrefRow[] = [];
    for (const row of scopes) {
      const mine = readStamp(row.accountKey, row.symbolKey);
      const remoteMs = Date.parse(row.updatedAt);
      const localMs = mine ? Date.parse(mine) : Number.NaN;
      // A scope this device has never written is adopted outright — the
      // new-device case, and the whole point. Otherwise newest wins, and a
      // tie keeps local: the device in front of the trader is the one they
      // are looking at.
      if (Number.isFinite(localMs) && !(remoteMs > localMs)) continue;
      applyScope(row);
      adopted.push(row);
    }
    return adopted;
  } catch {
    return [];
  }
}

/**
 * Push one scope's current values up.
 *
 * Debounced per scope: the pane-height drag and the indicator picker both
 * write on every change, and one request per pixel would be absurd.
 */
const pendingPush = new Map<string, ReturnType<typeof setTimeout>>();
const PUSH_DEBOUNCE_MS = 1500;

export function pushChartPrefs(accountId: string | null, symbol: string | null): void {
  if (typeof window === "undefined") return;
  const row = localScope(accountId, symbol);
  if (!row) return;
  const id = scopeId(row);

  const existing = pendingPush.get(id);
  if (existing) clearTimeout(existing);

  pendingPush.set(
    id,
    setTimeout(() => {
      pendingPush.delete(id);
      const now = new Date().toISOString();
      // Stamp before the request, not after: if the response never arrives,
      // this device still knows it has the newer copy and will not adopt the
      // server's older one on the next pull.
      try {
        localStorage.setItem(stampKey(row.accountKey, row.symbolKey), now);
      } catch {
        // Nothing to do — see applyScope.
      }
      void fetch("/api/preferences/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({
          scopes: [
            {
              accountId: row.accountKey === ANY_SCOPE ? null : row.accountKey,
              symbol: row.symbolKey === ANY_SCOPE ? null : row.symbolKey,
              prefs: row.prefs,
            },
          ],
        }),
      }).catch(() => {
        // A chart preference is not worth interrupting anyone for. The next
        // change pushes again, and the values are safe locally regardless.
      });
    }, PUSH_DEBOUNCE_MS),
  );
}
