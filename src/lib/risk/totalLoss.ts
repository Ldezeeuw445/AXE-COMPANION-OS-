/**
 * Total (maximum) loss: has the account reached the limit that ends it?
 *
 * The daily limit costs a trader the rest of the day; this one costs the
 * account. The auto-trade guard checked only the first, so an unattended order
 * could still go out on an account already past its prop firm's maximum loss.
 *
 * The basis follows the same rules as the drawdown alert (`drawdownAlert.ts`):
 *  - `initial_balance` (static, FTMO 2-Step): the stated account size, else the
 *    first balance AXE recorded (`liveAccountState.initialBalance`).
 *  - `trailing_eod_balance` / `trailing_peak_balance`: the highest balance
 *    recorded (`liveAccountState.peakBalance`). The percentage is of that peak,
 *    as in the alert.
 *  - no basis (the trader typed a percentage and never said what it is of, or
 *    the account is an FTMO account whose model is not named, and the models
 *    disagree on static vs trailing): UNKNOWN. A "10%" that is static on one
 *    model and trailing on another cannot be enforced by guessing.
 *  - `day_start_*` is not a total-loss basis any firm uses and the day anchor in
 *    metadata can be a day old: treated as unknown.
 *
 * Equity, not balance: firms measure the floor against equity, floating
 * positions included.
 *
 * Fails closed: a limit is set but the basis is missing, or the equity is
 * missing or older than {@link TOTAL_LOSS_MAX_EQUITY_AGE_MINUTES}, means
 * `total_loss_unknown`, never "fine". No limit set means nothing to enforce.
 *
 * Dependency-free apart from the pure daily-loss helpers, so the verify
 * suite can run it with strip-types.
 */
import type { LossBasis } from "./accountProfile";
import { validAccountSize } from "./dailyLoss";
import { GUARD_EQUITY_MAX_AGE_SECONDS } from "./guardEquity";

/** Buffer under the published cap, in percentage points — same as the daily guard. */
export const TOTAL_LOSS_BUFFER_PCT = 0.5;

/**
 * How old the equity reading may be. Same threshold the guard uses to decide a
 * refresh is needed (`GUARD_EQUITY_MAX_AGE_SECONDS`): equity that is hours or
 * days old says nothing about where the account is now.
 */
export const TOTAL_LOSS_MAX_EQUITY_AGE_MINUTES = GUARD_EQUITY_MAX_AGE_SECONDS / 60;

export type TotalLossInput = {
  maxTotalLossPct: number | null | undefined;
  basis: LossBasis | null | undefined;
  /** Latest equity; null when it cannot be read. */
  currentEquity: number | null | undefined;
  /**
   * When `currentEquity` was recorded. Required: null/unparseable means the
   * age is unknown, which is treated as stale.
   */
  equityAsOf: Date | string | number | null | undefined;
  now: Date;
  /** Defaults to {@link TOTAL_LOSS_MAX_EQUITY_AGE_MINUTES}. */
  maxEquityAgeMinutes?: number | null;
  /** `metadata.accountSize` as the trader stated it (already ceiling-checked or not: it is checked here). */
  accountSize?: number | null;
  /** First balance AXE recorded (`liveAccountState.initialBalance`). */
  initialBalance?: number | null;
  /** Highest balance/equity AXE recorded (`liveAccountState.peakBalance`). */
  peakBalance?: number | null;
  bufferPct?: number | null;
};

export type TotalLossDecision =
  | { status: "ok"; usedPct: number | null; limitPct: number | null }
  | {
      status: "blocked";
      reason: "total_loss_reached";
      usedPct: number;
      limitPct: number;
      detail: string;
    }
  | { status: "unknown"; reason: "total_loss_unknown"; detail: string };

function positive(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `liveAccountState.peakBalance` from account metadata, or null. */
export function livePeakBalance(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const live = (metadata as Record<string, unknown>).liveAccountState;
  if (!live || typeof live !== "object" || Array.isArray(live)) return null;
  return positive((live as Record<string, unknown>).peakBalance);
}

/**
 * Where the loss is measured from (`reference`) and what the firm's percentage
 * is a percentage of (`base`). Null when the basis cannot be established.
 */
export function totalLossFrame(
  input: Pick<TotalLossInput, "basis" | "accountSize" | "initialBalance" | "peakBalance">,
): { reference: number; base: number; phrase: string } | null {
  const size = validAccountSize(input.accountSize);
  const initial = positive(input.initialBalance);
  const peak = positive(input.peakBalance);

  switch (input.basis) {
    case "initial_balance": {
      const ref = size ?? initial;
      return ref == null ? null : { reference: ref, base: ref, phrase: "from the starting balance" };
    }
    case "trailing_eod_balance":
    case "trailing_peak_balance":
      return peak == null ? null : { reference: peak, base: peak, phrase: "from the highest balance" };
    default:
      // No basis, or day_start_* (not a total-loss basis).
      return null;
  }
}

export function evaluateTotalLoss(input: TotalLossInput): TotalLossDecision {
  const limitRaw = input.maxTotalLossPct;
  const hasLimit = limitRaw != null && Number.isFinite(limitRaw) && limitRaw > 0;
  if (!hasLimit) return { status: "ok", usedPct: null, limitPct: null };
  const limit = Number(limitRaw);

  const unknown = (why: string): TotalLossDecision => ({
    status: "unknown",
    reason: "total_loss_unknown",
    detail: `Not placed: this account's maximum total loss is ${limit}% and ${why} Missing risk data means no automatic order.`,
  });

  if (!input.basis) {
    return unknown(
      "AXE does not know whether that limit is static or trailing. Pick your firm and account type in the account rules.",
    );
  }
  const frame = totalLossFrame(input);
  if (frame == null) {
    return unknown(
      "AXE cannot work out the balance it is measured from. Fill in your account size in the account rules, or wait for the next balance sync.",
    );
  }
  const equity = positive(input.currentEquity);
  if (equity == null) return unknown("AXE cannot read the account's live equity.");

  const asOfMs = input.equityAsOf == null ? Number.NaN : new Date(input.equityAsOf).getTime();
  const maxAge =
    input.maxEquityAgeMinutes != null && Number.isFinite(input.maxEquityAgeMinutes) && input.maxEquityAgeMinutes > 0
      ? input.maxEquityAgeMinutes
      : TOTAL_LOSS_MAX_EQUITY_AGE_MINUTES;
  const ageMin = (input.now.getTime() - asOfMs) / 60_000;
  if (!Number.isFinite(ageMin)) return unknown("AXE does not know when the account's equity was last read.");
  // A reading from the future (clock skew) is not fresher than "now": allow a minute.
  if (ageMin > maxAge || ageMin < -1) {
    return unknown(
      `the account's last equity reading is ${ageMin < -1 ? "from the future" : `${Math.round(ageMin)} min old`} (limit ${maxAge} min). Reconnect or sync the account.`,
    );
  }

  const usedPct = ((frame.reference - equity) / frame.base) * 100;
  const buffer =
    input.bufferPct == null || !Number.isFinite(input.bufferPct)
      ? TOTAL_LOSS_BUFFER_PCT
      : Math.max(0, Number(input.bufferPct));
  const effectiveLimit = Math.max(0, limit - buffer);

  if (usedPct >= effectiveLimit) {
    return {
      status: "blocked",
      reason: "total_loss_reached",
      usedPct,
      limitPct: limit,
      detail: `Not placed: this account is ${Math.max(0, usedPct).toFixed(2)}% down ${frame.phrase} and its maximum total loss is ${limit}% (buffer ${buffer}%). AXE will not open automatic trades on an account at its total loss limit.`,
    };
  }

  return { status: "ok", usedPct, limitPct: limit };
}
