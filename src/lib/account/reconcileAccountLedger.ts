import { asFiniteNumber, sumLedger, type LedgerTotals, type TradePnlParts } from "@/lib/journal/tradePnl";

/**
 * Companion can add up stored closed trades. It cannot reconstruct a broker
 * cash ledger (deposits, withdrawals, credit, adjustments) — that lives in
 * Trading OS shared core (master-plan C1), which is not in this repo yet.
 *
 * So we show two numbers side by side:
 *   - realized net from broker_trades (this app)
 *   - last-sync balance/equity from MetaApi metadata (broker snapshot)
 * and we never pretend they must equal each other.
 */

export const TRADING_OS_C1_CAVEAT =
  "Broker balance includes deposits, withdrawals and credit. Those cash movements are not in Companion yet — they need Trading OS shared core (C1). Realized P&L below is from stored closed trades only.";

export type AccountSnapshot = {
  balance: number | null;
  equity: number | null;
  currency: string | null;
};

export type AccountLedger = LedgerTotals &
  AccountSnapshot & {
    accountId: string;
    /** True when we have both a snapshot and at least one closed trade. */
    hasBothViews: boolean;
    /** Always false until C1 supplies cash movements. */
    canReconcileToBalance: false;
    caveat: string;
  };

export function readAccountSnapshot(metadata: Record<string, unknown> | null | undefined): AccountSnapshot {
  const raw = metadata?.accountSummary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { balance: null, equity: null, currency: null };
  }
  const summary = raw as Record<string, unknown>;
  const balance = summary.balance == null ? null : asFiniteNumber(summary.balance, Number.NaN);
  const equity = summary.equity == null ? null : asFiniteNumber(summary.equity, Number.NaN);
  const currency =
    typeof summary.currency === "string" && summary.currency.trim()
      ? summary.currency.trim().toUpperCase()
      : null;
  return {
    balance: balance != null && Number.isFinite(balance) ? balance : null,
    equity: equity != null && Number.isFinite(equity) ? equity : null,
    currency,
  };
}

export function reconcileAccountLedger(input: {
  accountId: string;
  trades: readonly TradePnlParts[];
  snapshot?: AccountSnapshot | null;
}): AccountLedger {
  const totals = sumLedger(input.trades);
  const snapshot = input.snapshot ?? { balance: null, equity: null, currency: null };
  return {
    accountId: input.accountId,
    ...totals,
    ...snapshot,
    hasBothViews: snapshot.balance != null && totals.tradeCount > 0,
    canReconcileToBalance: false,
    caveat: TRADING_OS_C1_CAVEAT,
  };
}

export function groupTradesByAccount(
  rows: readonly { accountId: string; pnl: number; fees: number }[],
): Map<string, TradePnlParts[]> {
  const map = new Map<string, TradePnlParts[]>();
  for (const row of rows) {
    const list = map.get(row.accountId) ?? [];
    list.push({ pnl: row.pnl, fees: row.fees });
    map.set(row.accountId, list);
  }
  return map;
}
