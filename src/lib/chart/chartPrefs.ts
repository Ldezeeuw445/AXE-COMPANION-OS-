/**
 * Your chart setup, as something the server can hold.
 *
 * Until now every chart preference lived in `localStorage` and nowhere else:
 * indicator toggles, SMC tools, MA period and type, pane heights and order,
 * fib mode, theme. That had three costs, and the third is the one that
 * mattered to Luka.
 *
 *  1. A new phone, a cleared browser or a second device started from nothing.
 *  2. Companion and Trading OS run on one Supabase project and share one
 *     account, and shared nothing about how the trader actually looks at a
 *     chart.
 *  3. **AXE could not see it.** `learningArcService` used to claim
 *     "Key indicators they use: RSI, MACD, MA" — a constant in the source,
 *     handed to the model as fact for every trader. I removed it rather than
 *     keep lying, which left AXE knowing nothing at all about how someone
 *     reads a chart. This is what makes it real: the trader's own toggles,
 *     read back server-side.
 *
 * Dependency-free: the verify suite exercises it directly, and the API route
 * and the browser both have to agree on exactly these rules.
 */

/* ── Which keys may sync ──────────────────────────────────────────────────
   An allowlist, not a prefix match. The endpoint writes into a jsonb column
   from a request body, so without this it is an unbounded key/value store
   for anything a client cares to send, under the trader's own row.
   These mirror `PREF_KEYS` in `@/lib/accountPreferences`; the verify suite
   asserts the two lists stay in step rather than trusting a comment to.
   ───────────────────────────────────────────────────────────────────────── */

/** Per account: theme and grid. Not symbol-specific. */
export const SYNCED_ACCOUNT_KEYS = ["axe-chart-theme", "axe-chart-grid"] as const;

/** Per account + symbol: everything that describes how a chart is read. */
export const SYNCED_SYMBOL_KEYS = [
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

export const SYNCED_KEYS = [...SYNCED_ACCOUNT_KEYS, ...SYNCED_SYMBOL_KEYS] as const;
export type SyncedKey = (typeof SYNCED_KEYS)[number];

const SYNCED_KEY_SET = new Set<string>(SYNCED_KEYS);

export function isSyncedKey(key: string): key is SyncedKey {
  return SYNCED_KEY_SET.has(key);
}

/**
 * Longest value we will store, per key.
 *
 * Every one of these is a number, a short word, or a small flat JSON object of
 * booleans. `paneOrder` is the largest and it is three names. 2 KB is roughly
 * forty times the biggest real value, and it stops one crafted request turning
 * a preferences row into a megabyte of storage.
 */
export const MAX_PREF_VALUE_LENGTH = 2048;

/** The sentinel for "no account" and "not symbol-specific". */
export const ANY_SCOPE = "*";

/**
 * Scope identifiers, normalised the same way on both sides.
 *
 * Postgres will not enforce a primary key across nullable columns, so the
 * absence of an account is the literal `*` rather than null — one row per
 * scope, upsertable, with no "is null" special case anywhere.
 */
export function accountScope(accountId: string | null | undefined): string {
  const trimmed = String(accountId ?? "").trim();
  return trimmed ? trimmed.slice(0, 64) : ANY_SCOPE;
}

export function symbolScope(symbol: string | null | undefined): string {
  const trimmed = String(symbol ?? "").trim().toUpperCase();
  return trimmed ? trimmed.slice(0, 32) : ANY_SCOPE;
}

export type ChartPrefScope = {
  accountKey: string;
  symbolKey: string;
};

export type ChartPrefRow = ChartPrefScope & {
  prefs: Record<string, string>;
  /** ISO. Decides which side of a two-device conflict wins. */
  updatedAt: string;
};

/** `account::symbol` — a map key, so scopes can be compared without nesting. */
export function scopeId(scope: ChartPrefScope): string {
  return `${scope.accountKey}::${scope.symbolKey}`;
}

/**
 * Keep only the pairs that may be stored, and only in the right scope.
 *
 * A symbol-scoped key sent against the account scope, or the reverse, is
 * dropped rather than stored somewhere it will never be read from — a
 * preference that silently goes nowhere is worse than one that is refused.
 */
export function sanitisePrefs(
  input: unknown,
  scope: ChartPrefScope,
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  // Each scope takes exactly its own keys. This read
  // `forSymbol ? SYMBOL_KEYS : SYNCED_KEYS`, which let the account scope
  // swallow every per-symbol key as well — they would have been written to a
  // row nothing ever reads them from, which is the quietest possible way for a
  // preference to stop working.
  const forSymbol = scope.symbolKey !== ANY_SCOPE;
  const allowed: ReadonlySet<string> = new Set<string>(
    forSymbol ? SYNCED_SYMBOL_KEYS : SYNCED_ACCOUNT_KEYS,
  );

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof value !== "string") continue;
    if (value.length > MAX_PREF_VALUE_LENGTH) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Which side of a two-device disagreement wins.
 *
 * Per scope, not per key: the keys inside one scope are read together and
 * written together, so mixing halves of two devices' setups would produce a
 * chart neither device ever had. Newest scope wins whole, and a tie keeps
 * local — the device in front of the trader is the one they are looking at.
 */
export function pickNewerScope(
  local: ChartPrefRow | null,
  remote: ChartPrefRow | null,
): ChartPrefRow | null {
  if (!local) return remote;
  if (!remote) return local;
  const localMs = Date.parse(local.updatedAt);
  const remoteMs = Date.parse(remote.updatedAt);
  if (!Number.isFinite(remoteMs)) return local;
  if (!Number.isFinite(localMs)) return remote;
  return remoteMs > localMs ? remote : local;
}

/**
 * Merge a server snapshot over what this device has, scope by scope.
 *
 * A scope the server has and the device does not is adopted outright — that is
 * the new-device case, and the whole point.
 */
export function mergeScopes(
  local: ChartPrefRow[],
  remote: ChartPrefRow[],
): ChartPrefRow[] {
  const byScope = new Map<string, ChartPrefRow>();
  for (const row of local) byScope.set(scopeId(row), row);
  for (const row of remote) {
    const id = scopeId(row);
    const winner = pickNewerScope(byScope.get(id) ?? null, row);
    if (winner) byScope.set(id, winner);
  }
  return [...byScope.values()];
}

/* ── What AXE reads out of it ──────────────────────────────────────────── */

/** Display names, so AXE says "RSI" and not "rsi". */
const INDICATOR_LABELS: Record<string, string> = {
  volume: "Volume",
  ma: "Moving average",
  macd: "MACD",
  bollinger: "Bollinger Bands",
  rsi: "RSI",
  vwap: "VWAP",
  poc: "Volume POC",
};

const SMC_LABELS: Record<string, string> = {
  structure: "Market structure",
  orderBlocks: "Order blocks",
  fvg: "Fair value gaps",
  ifvg: "Inverse FVGs",
  pdh: "Previous day high",
  pdl: "Previous day low",
  pdq: "Previous day equilibrium",
  sessionOpen: "Session open",
  swingPoints: "Swing points",
  supplyDemand: "Supply / demand",
};

function enabledFlags(raw: string | undefined, labels: Record<string, string>): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if ((parsed as Record<string, unknown>)[key] === true) out.push(label);
  }
  return out;
}

export type ChartSetupSummary = {
  /** Indicators the trader actually has switched on, by display name. */
  indicators: string[];
  /** SMC overlays they actually have switched on. */
  smcTools: string[];
  /** How many chart scopes this was counted across. */
  scopes: number;
  /** Symbols these were read from, so a count has something behind it. */
  symbols: string[];
};

/**
 * What this trader's charts actually have switched on.
 *
 * Counted across every symbol scope they have saved, deduplicated, ordered by
 * how many of their charts use it — so the first few are what they reach for
 * on everything rather than what they tried once.
 *
 * Empty is a real answer and the caller must say so rather than reaching for a
 * plausible "RSI, MACD, MA". That constant is exactly what this replaces.
 */
export function summariseChartSetup(rows: ChartPrefRow[]): ChartSetupSummary {
  const indicatorCounts = new Map<string, number>();
  const smcCounts = new Map<string, number>();
  const symbols = new Set<string>();
  let scopes = 0;

  for (const row of rows) {
    if (row.symbolKey === ANY_SCOPE) continue;
    scopes += 1;
    symbols.add(row.symbolKey);
    for (const label of enabledFlags(row.prefs["axe.chart.indicatorFlags"], INDICATOR_LABELS)) {
      indicatorCounts.set(label, (indicatorCounts.get(label) ?? 0) + 1);
    }
    for (const label of enabledFlags(row.prefs["axe.chart.smcFlags"], SMC_LABELS)) {
      smcCounts.set(label, (smcCounts.get(label) ?? 0) + 1);
    }
  }

  const ranked = (counts: Map<string, number>): string[] =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label]) => label);

  return {
    indicators: ranked(indicatorCounts),
    smcTools: ranked(smcCounts),
    scopes,
    symbols: [...symbols].sort(),
  };
}
