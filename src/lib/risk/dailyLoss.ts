/**
 * Prop-firm daily loss from start-of-day equity to live equity.
 *
 * Realised-only P&L against balance (the old guard) lets a funded account
 * keep opening while floating loss has already breached the day cap. Firms
 * measure the day from equity at the broker-day open — including open
 * positions — so that is what this computes.
 *
 * Dependency-free so the verify suite can exercise it with strip-types.
 */

/** Default buffer under the published cap (percentage points). */
export const DAILY_LOSS_BUFFER_PCT = 0.5;

export type DailyLossInput = {
  /** Equity (or firm base) at the broker-day open. */
  startEquity: number | null | undefined;
  /** Live equity now: balance + floating P&L (and swap/commission as reported). */
  currentEquity: number | null | undefined;
  /** Account's daily loss limit as a positive percent, e.g. 4. */
  maxDailyLossPct: number | null | undefined;
  /** Soft buffer under the limit. Defaults to {@link DAILY_LOSS_BUFFER_PCT}. */
  bufferPct?: number | null;
  /**
   * What `maxDailyLossPct` is a percent OF (see {@link dailyLossReference}),
   * e.g. the account size. Omitted: the start equity, as before.
   */
  referenceBase?: number | null;
};

export type DailyLossDecision =
  | { status: "ok"; dayResultPct: number; dailyLossPct: number; limitPct: number | null }
  | {
      status: "blocked";
      reason: "daily_loss_reached";
      dayResultPct: number;
      dailyLossPct: number;
      limitPct: number;
      detail: string;
    }
  | { status: "unknown"; reason: "daily_loss_unknown"; detail: string };

/**
 * Day result as a signed percent of start equity. Negative is a loss.
 * Null when either side is missing or not a usable positive start.
 */
export function dayResultPctFromEquity(
  startEquity: number | null | undefined,
  currentEquity: number | null | undefined,
): number | null {
  if (startEquity == null || currentEquity == null) return null;
  if (!Number.isFinite(startEquity) || !Number.isFinite(currentEquity)) return null;
  if (startEquity <= 0) return null;
  return ((currentEquity - startEquity) / startEquity) * 100;
}

/**
 * Live equity from a snapshot row, or from balance + open floating P&L when
 * the snapshot has no equity column filled in.
 *
 * A missing balance is NOT zero. `Number(null)` is 0, so the old code turned
 * "no balance" into "equity = floating P&L only": a +$300 float on a $100k
 * account read as $300 equity, and the guard saw a ~-99.7% day and blocked a
 * perfectly fine trade (or computed a huge risk %). Now:
 *   1. snapshot equity, when present and > 0;
 *   2. snapshot balance + floating P&L, when the balance really is there;
 *   3. `fallbackBalance` (last known balance from the same broker day,
 *      supplied by the caller) + floating P&L;
 *   4. otherwise null — "unknown", which the guard fails closed on.
 * Never a bare floating P&L, and never a guess that loosens a limit.
 */
export function resolveCurrentEquity(input: {
  snapshotEquity?: number | null;
  snapshotBalance?: number | null;
  floatingPnl?: number | null;
  fallbackBalance?: number | null;
}): number | null {
  const positive = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const eq = positive(input.snapshotEquity);
  if (eq != null) return eq;

  const bal = positive(input.snapshotBalance) ?? positive(input.fallbackBalance);
  if (bal == null) return null;

  const floating = input.floatingPnl == null ? 0 : Number(input.floatingPnl);
  if (!Number.isFinite(floating)) return null;
  const derived = bal + floating;
  return Number.isFinite(derived) && derived > 0 ? derived : null;
}

/**
 * Decide whether the day's equity path already (or nearly) hits the cap.
 *
 * Fail-closed only when a daily limit is configured: missing equity data then
 * means `daily_loss_unknown`, never "fine". Accounts with no daily cap do not
 * get blocked for missing numbers.
 */
export function evaluateDailyLoss(input: DailyLossInput): DailyLossDecision {
  const limitRaw = input.maxDailyLossPct;
  const hasLimit = limitRaw != null && Number.isFinite(limitRaw) && limitRaw > 0;
  const dayResultPct =
    input.referenceBase == null
      ? dayResultPctFromEquity(input.startEquity, input.currentEquity)
      : dayResultPctOfReference(input.startEquity, input.currentEquity, input.referenceBase);

  if (!hasLimit) {
    if (dayResultPct == null) {
      return {
        status: "ok",
        dayResultPct: 0,
        dailyLossPct: 0,
        limitPct: null,
      };
    }
    return {
      status: "ok",
      dayResultPct,
      dailyLossPct: Math.max(0, -dayResultPct),
      limitPct: null,
    };
  }

  const limit = Number(limitRaw);
  if (dayResultPct == null) {
    return {
      status: "unknown",
      reason: "daily_loss_unknown",
      detail: `Not placed: this account's daily loss limit is ${limit}% and AXE cannot read today's start equity or live equity. Missing risk data means no new order.`,
    };
  }

  const buffer =
    input.bufferPct == null || !Number.isFinite(input.bufferPct)
      ? DAILY_LOSS_BUFFER_PCT
      : Math.max(0, Number(input.bufferPct));
  const effectiveLimit = Math.max(0, limit - buffer);
  const dailyLossPct = Math.max(0, -dayResultPct);

  if (dayResultPct <= -effectiveLimit) {
    return {
      status: "blocked",
      reason: "daily_loss_reached",
      dayResultPct,
      dailyLossPct,
      limitPct: limit,
      detail: `Not placed: you are ${dailyLossPct.toFixed(2)}% down today and this account's limit is ${limit}% (buffer ${buffer}%). The day is over for new risk.`,
    };
  }

  return { status: "ok", dayResultPct, dailyLossPct, limitPct: limit };
}

/**
 * Firm daily base when the exact open tick was missed: stricter of balance
 * and equity at the first available reading of the broker day.
 */
export function dayAnchorBase(
  balance: number | null | undefined,
  equity: number | null | undefined,
  mode: "equity" | "balance" | "max" = "max",
): number | null {
  const bal = Number(balance);
  const eq = Number(equity);
  const balOk = Number.isFinite(bal) && bal > 0 ? bal : null;
  const eqOk = Number.isFinite(eq) && eq > 0 ? eq : null;
  if (mode === "balance") return balOk;
  if (mode === "equity") return eqOk ?? balOk;
  if (balOk == null) return eqOk;
  if (eqOk == null) return balOk;
  return Math.max(balOk, eqOk);
}

/* ── What the daily-loss percentage is a percentage OF ─────────────────────
   FTMO (and most firms) publish the daily limit as X% of the INITIAL account
   balance, measured from the day's opening balance: a $100k 2-Step account
   may lose $5,000 from wherever the day started, whether the account is at
   $100k or $110k. Taking X% of the day-start figure instead hands an account
   in profit a bigger allowance than the firm's ($5,500 at $110k) — the guard
   and the alert both fire too late, on the accounts that matter most.

   So the day-start anchor stays the point the loss is measured FROM, and the
   allowance is X% of the account size. `day_start_equity` is the one basis a
   firm explicitly publishes as "% of the day's starting equity" (Upcomers
   Oracle) and is left as it was. Anything else with no known account size
   takes the smallest base we know, so it is never looser than before. */

/** Positive finite number, else null. */
function positiveOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Highest account size taken as real. Same value as
 * `MAX_ACCOUNT_SIZE_CEILING` in `lib/trading/accountRules.ts` (kept local so
 * this file stays dependency-free; a test holds the two equal). Anything above
 * is a typo or a bad import, and using it as a base would make every loss
 * percentage tiny — i.e. switch the limits off.
 */
export const STATED_ACCOUNT_SIZE_CEILING = 10_000_000;

/** A usable stated account size: positive, finite, at most the ceiling. */
export function validAccountSize(value: unknown): number | null {
  const n = positiveOrNull(value);
  return n != null && n <= STATED_ACCOUNT_SIZE_CEILING ? n : null;
}

/**
 * Account size the trader (or an import) stated explicitly in
 * `user_broker_accounts.metadata`: `tradingRules.accountSize`, then a
 * top-level `accountSize` / `initialBalance`. Null when none is stated, or
 * when the value is not a usable size (see {@link validAccountSize}).
 *
 * Not `liveAccountState.initialBalance`: that is the first balance AXE happened
 * to observe, which on an account connected while in profit is above the real
 * account size. See {@link inferredInitialBalance}.
 */
export function statedAccountSize(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rec = metadata as Record<string, unknown>;
  const rules =
    rec.tradingRules && typeof rec.tradingRules === "object" && !Array.isArray(rec.tradingRules)
      ? (rec.tradingRules as Record<string, unknown>)
      : {};
  return (
    validAccountSize(rules.accountSize) ??
    validAccountSize(rec.accountSize) ??
    validAccountSize(rec.initialBalance)
  );
}

/** First balance AXE recorded for the account (`liveAccountState.initialBalance`). */
export function inferredInitialBalance(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const live = (metadata as Record<string, unknown>).liveAccountState;
  if (!live || typeof live !== "object" || Array.isArray(live)) return null;
  return positiveOrNull((live as Record<string, unknown>).initialBalance);
}

/**
 * The amount base the daily-loss percentage applies to.
 *
 *  - `day_start_equity` (explicit firm rule): the day-start anchor, unchanged.
 *  - `day_start_balance` / `initial_balance` (FTMO-style, and the prop
 *    default): the stated account size when known; otherwise the smaller of
 *    the anchor and the inferred initial balance.
 *  - no/unknown basis (e.g. a % the trader typed without one): the smallest
 *    known base — never looser than measuring from the anchor.
 *
 * Null only when the anchor itself is unknown (the caller fails closed).
 */
export function dailyLossReference(input: {
  /** Day-start anchor the loss is measured from (balance/equity at the open). */
  dayStartBase: number | null | undefined;
  basis: string | null | undefined;
  /** Explicitly stated account size. Authoritative for the FTMO-style basis. */
  accountSize?: number | null;
  /** First observed balance. A hint only: used as a ceiling, never a floor. */
  inferredInitialBalance?: number | null;
}): number | null {
  const anchor = positiveOrNull(input.dayStartBase);
  if (anchor == null) return null;
  if (input.basis === "day_start_equity") return anchor;

  const stated = validAccountSize(input.accountSize);
  const inferred = positiveOrNull(input.inferredInitialBalance);

  if (input.basis === "day_start_balance" || input.basis === "initial_balance") {
    if (stated != null) return stated;
    return inferred != null ? Math.min(anchor, inferred) : anchor;
  }

  const known = [anchor, stated, inferred].filter((n): n is number => n != null);
  return Math.min(...known);
}

/**
 * Day result as a signed percent of `reference` (see {@link dailyLossReference}),
 * measured from the day-start anchor. Negative is a loss. Comparable directly
 * against the firm's published daily-loss percentage.
 */
export function dayResultPctOfReference(
  startEquity: number | null | undefined,
  currentEquity: number | null | undefined,
  reference: number | null | undefined,
): number | null {
  if (startEquity == null || currentEquity == null || reference == null) return null;
  if (!Number.isFinite(startEquity) || !Number.isFinite(currentEquity) || !Number.isFinite(reference)) {
    return null;
  }
  if (startEquity <= 0 || reference <= 0) return null;
  return ((currentEquity - startEquity) / reference) * 100;
}
