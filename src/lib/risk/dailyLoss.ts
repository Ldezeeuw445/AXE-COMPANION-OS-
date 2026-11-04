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
 */
export function resolveCurrentEquity(input: {
  snapshotEquity?: number | null;
  snapshotBalance?: number | null;
  floatingPnl?: number | null;
}): number | null {
  const eq = Number(input.snapshotEquity);
  if (Number.isFinite(eq) && eq > 0) return eq;

  const bal = Number(input.snapshotBalance);
  const floating = Number(input.floatingPnl ?? 0);
  if (Number.isFinite(bal) && Number.isFinite(floating)) {
    const derived = bal + floating;
    if (Number.isFinite(derived) && derived > 0) return derived;
  }
  return null;
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
  const dayResultPct = dayResultPctFromEquity(input.startEquity, input.currentEquity);

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
