/**
 * Where the auto-trade guard gets the account's equity from.
 *
 * The guard used to read `mt5_account_snapshots`. Nothing in the app writes to
 * that table (it holds one row, from April), so every prop-account check came
 * back "unknown" and unattended trading never worked. The figures the app
 * actually keeps live in `user_broker_accounts.metadata.liveAccountState`,
 * written by `persistLiveFiguresAndPositions` on every sync and live event,
 * with the broker-day anchors (`dayStartBalance`, `dayStartEquity`,
 * `dayStartDate`) rolled by `nextLiveAccountState`.
 *
 * A reading is usable when it has a balance or equity, is not older than
 * {@link GUARD_EQUITY_MAX_AGE_SECONDS}, and its day anchors belong to the
 * current broker day. Otherwise, and only when a limit needs it, the caller
 * refreshes the state once through the read-only broker path and checks again.
 * Still unusable means unknown, and unknown blocks.
 *
 * Dependency-free so tests can drive it with fake `refresh` functions.
 */

/** A reading older than this is not "where the account is now". */
export const GUARD_EQUITY_MAX_AGE_SECONDS = 120;

export type LiveAccountReading = {
  equity: number | null;
  balance: number | null;
  dayStartBalance: number | null;
  dayStartEquity: number | null;
  /** Broker-day key (`YYYY-MM-DD`) the day anchors belong to. */
  dayStartDate: string | null;
  peakBalance: number | null;
  initialBalance: number | null;
  /** ISO time of the last write of the live state. */
  updatedAt: string | null;
};

function positive(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const EMPTY: LiveAccountReading = {
  equity: null,
  balance: null,
  dayStartBalance: null,
  dayStartEquity: null,
  dayStartDate: null,
  peakBalance: null,
  initialBalance: null,
  updatedAt: null,
};

/** `metadata.liveAccountState` as a typed reading; all nulls when absent. */
export function readLiveAccountReading(metadata: unknown): LiveAccountReading {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { ...EMPTY };
  const live = (metadata as Record<string, unknown>).liveAccountState;
  if (!live || typeof live !== "object" || Array.isArray(live)) return { ...EMPTY };
  const r = live as Record<string, unknown>;
  return {
    equity: positive(r.equity),
    balance: positive(r.balance),
    dayStartBalance: positive(r.dayStartBalance),
    dayStartEquity: positive(r.dayStartEquity),
    dayStartDate: typeof r.dayStartDate === "string" && r.dayStartDate ? r.dayStartDate : null,
    peakBalance: positive(r.peakBalance),
    initialBalance: positive(r.initialBalance),
    updatedAt: typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : null,
  };
}

/** Age of the reading in seconds; null when it has no parseable time. */
export function readingAgeSeconds(reading: LiveAccountReading, now: Date): number | null {
  if (!reading.updatedAt) return null;
  const t = Date.parse(reading.updatedAt);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 1000;
}

export type ReadingVerdict = "usable" | "missing" | "undated" | "stale" | "future" | "wrong_day";

/**
 * Is this reading fit to enforce a loss limit on? `dayKey` is the current
 * broker-day key; anchors from another day would measure yesterday's loss.
 */
export function judgeReading(reading: LiveAccountReading, now: Date, dayKey: string): ReadingVerdict {
  if (reading.equity == null && reading.balance == null) return "missing";
  const age = readingAgeSeconds(reading, now);
  if (age == null) return "undated";
  // A minute of clock skew is tolerated; a reading from the future is not trusted.
  if (age < -60) return "future";
  if (age > GUARD_EQUITY_MAX_AGE_SECONDS) return "stale";
  if (reading.dayStartDate !== dayKey) return "wrong_day";
  return "usable";
}

export type GuardEquityResolution = {
  /** The reading that was judged last (after a refresh, the refreshed one). */
  reading: LiveAccountReading;
  /** The metadata that reading came from. */
  metadata: Record<string, unknown>;
  verdict: ReadingVerdict;
  usable: boolean;
  /** Where a usable reading came from. */
  source: "stored" | "refreshed" | null;
  /** True when a refresh was attempted. */
  refreshAttempted: boolean;
  /** True when the refresh itself threw or returned nothing. */
  refreshFailed: boolean;
};

/**
 * Resolve the live reading for the guard.
 *
 * - Usable stored reading: used as is, no broker call.
 * - Not usable and `canRefresh` (a cloud MT5 account): `refresh` runs once. It
 *   must be read-only (account information and positions) and persist what it
 *   read; it returns the account's new metadata, or null on failure.
 * - Not usable and no refresh path (Alpaca, paper): stays unusable.
 *
 * Callers only invoke this when a limit needs equity, so an account without
 * limits never costs a broker round trip.
 */
export async function resolveGuardEquity(input: {
  metadata: Record<string, unknown>;
  now: Date;
  dayKey: string;
  canRefresh: boolean;
  refresh: () => Promise<Record<string, unknown> | null>;
}): Promise<GuardEquityResolution> {
  const stored = readLiveAccountReading(input.metadata);
  const verdict = judgeReading(stored, input.now, input.dayKey);
  if (verdict === "usable") {
    return {
      reading: stored,
      metadata: input.metadata,
      verdict,
      usable: true,
      source: "stored",
      refreshAttempted: false,
      refreshFailed: false,
    };
  }
  if (!input.canRefresh) {
    return {
      reading: stored,
      metadata: input.metadata,
      verdict,
      usable: false,
      source: null,
      refreshAttempted: false,
      refreshFailed: false,
    };
  }

  let refreshed: Record<string, unknown> | null = null;
  try {
    refreshed = await input.refresh();
  } catch {
    refreshed = null;
  }
  if (!refreshed) {
    return {
      reading: stored,
      metadata: input.metadata,
      verdict,
      usable: false,
      source: null,
      refreshAttempted: true,
      refreshFailed: true,
    };
  }
  const reading = readLiveAccountReading(refreshed);
  const after = judgeReading(reading, input.now, input.dayKey);
  return {
    reading,
    metadata: refreshed,
    verdict: after,
    usable: after === "usable",
    source: after === "usable" ? "refreshed" : null,
    refreshAttempted: true,
    refreshFailed: false,
  };
}

/** Does any configured limit need to know the account's equity? */
export function limitsNeedEquity(limits: {
  maxDailyLossPct: number | null | undefined;
  maxTotalLossPct: number | null | undefined;
}): boolean {
  const on = (v: number | null | undefined) => v != null && Number.isFinite(v) && v > 0;
  return on(limits.maxDailyLossPct) || on(limits.maxTotalLossPct);
}

/**
 * May the guard fetch a fresh state for this account? Only cloud MT5 accounts
 * have a read-only broker path (MetaApi); Alpaca and paper accounts do not, and
 * an account without a limit never needs one.
 */
export function canRefreshLiveState(input: {
  connectionMethod: string | null | undefined;
  needsEquity: boolean;
}): boolean {
  return input.needsEquity && input.connectionMethod === "cloud_mt5";
}
