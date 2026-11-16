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
 *  - no basis (the trader typed a percentage and never said what it is of): the
 *    STRICTEST reading. The loss is measured from the highest figure we know,
 *    against the smallest base we know, so the result is never looser than any
 *    real model would be.
 *  - `day_start_*` is not a total-loss basis any firm uses and the day anchor in
 *    metadata can be a day old: treated as unknown.
 *
 * Equity, not balance: firms measure the floor against equity, floating
 * positions included.
 *
 * Fails closed: a limit is set but the basis or the equity is missing means
 * `total_loss_unknown`, never "fine". No limit set means nothing to enforce.
 *
 * Dependency-free apart from the pure daily-loss helpers, so the verify
 * suite can run it with strip-types.
 */
import type { LossBasis } from "./accountProfile";
import { validAccountSize } from "./dailyLoss";

/** Buffer under the published cap, in percentage points — same as the daily guard. */
export const TOTAL_LOSS_BUFFER_PCT = 0.5;

export type TotalLossInput = {
  maxTotalLossPct: number | null | undefined;
  basis: LossBasis | null | undefined;
  /** Live equity now; null when it cannot be read. */
  currentEquity: number | null | undefined;
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
    case null:
    case undefined: {
      const known = [size, initial, peak].filter((n): n is number => n != null);
      if (known.length === 0) return null;
      return {
        reference: Math.max(...known),
        base: Math.min(...known),
        phrase: "from the highest known balance (strictest reading: the rule type is not set)",
      };
    }
    default:
      // day_start_* — not a total-loss basis.
      return null;
  }
}

export function evaluateTotalLoss(input: TotalLossInput): TotalLossDecision {
  const limitRaw = input.maxTotalLossPct;
  const hasLimit = limitRaw != null && Number.isFinite(limitRaw) && limitRaw > 0;
  if (!hasLimit) return { status: "ok", usedPct: null, limitPct: null };
  const limit = Number(limitRaw);

  const equity = positive(input.currentEquity);
  const frame = totalLossFrame(input);
  if (equity == null || frame == null) {
    const missing = equity == null ? "live equity" : "the balance this limit is measured from";
    return {
      status: "unknown",
      reason: "total_loss_unknown",
      detail: `Not placed: this account's maximum total loss is ${limit}% and AXE cannot read ${missing}. Fill in your account size in the account rules, or wait for the next balance sync. Missing risk data means no automatic order.`,
    };
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
