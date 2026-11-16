/**
 * What the auto-trade guard feeds its two loss checks, from one resolved live
 * reading (see `guardEquity.ts`). One place, so the daily check (#172: broker
 * day anchors) and the total check (#179: stated account size basis) can never
 * disagree about which equity or which day they are looking at.
 */
import type { LossBasis } from "./accountProfile";
import {
  dailyLossReference,
  dayAnchorBase,
  dayResultPctOfReference,
  resolveCurrentEquity,
} from "./dailyLoss";
import type { GuardEquityResolution } from "./guardEquity";
import { evaluateTotalLoss, type TotalLossDecision } from "./totalLoss";

export function guardLossInputs(input: {
  limits: {
    maxDailyLossPct: number | null;
    maxDailyLossBasis: LossBasis | null;
    maxTotalLossPct: number | null;
    maxTotalLossBasis: LossBasis | null;
  };
  resolved: Pick<GuardEquityResolution, "usable" | "reading">;
  /** Sum of open-position profit + swap (only used when equity itself is missing). */
  floatingPnl: number;
  /** `statedAccountSize(metadata)`. */
  accountSize: number | null;
  /** `inferredInitialBalance(metadata)`, used when the live state has none. */
  inferredInitial: number | null;
  /** Peak balance from the stored metadata, used when the live state has none. */
  inferredPeak: number | null;
  now: Date;
}): { currentEquity: number | null; dayResultPct: number | null; totalLoss: TotalLossDecision } {
  const { limits, resolved, now } = input;
  const live = resolved.reading;

  // Not usable (stale, wrong day, missing) means unknown, never "last known".
  const currentEquity = resolved.usable
    ? resolveCurrentEquity({
        snapshotEquity: live.equity,
        snapshotBalance: live.balance,
        floatingPnl: input.floatingPnl,
      })
    : null;

  const startEquity = resolved.usable
    ? dayAnchorBase(
        live.dayStartBalance,
        live.dayStartEquity,
        limits.maxDailyLossBasis === "day_start_balance" ? "balance" : "max",
      )
    : null;

  const initial = live.initialBalance ?? input.inferredInitial;
  const dailyBase = dailyLossReference({
    dayStartBase: startEquity,
    basis: limits.maxDailyLossBasis,
    accountSize: input.accountSize,
    inferredInitialBalance: initial,
  });
  const dayResultPct = dayResultPctOfReference(startEquity, currentEquity, dailyBase);

  const totalLoss = evaluateTotalLoss({
    maxTotalLossPct: limits.maxTotalLossPct,
    basis: limits.maxTotalLossBasis,
    currentEquity,
    equityAsOf: resolved.usable ? live.updatedAt : null,
    now,
    accountSize: input.accountSize,
    initialBalance: initial,
    peakBalance: live.peakBalance ?? input.inferredPeak,
  });

  return { currentEquity, dayResultPct, totalLoss };
}
