/**
 * Ledger math for closed broker_trades.
 *
 * MetaApi stores deal.profit separately from deal.commission + deal.swap.
 * `normalizeDealsToClosedTrades` keeps that split: `pnl` is the sum of profit,
 * `fees` is the sum of signed commission+swap (usually negative).
 *
 * Net result of a closed position is therefore `pnl + fees`, not `pnl - abs(fees)`.
 * Using abs() flips a credit swap into a cost and disagrees with the broker.
 */

export function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Signed fee total as stored on broker_trades.fees. */
export function signedFees(fees: unknown): number {
  return asFiniteNumber(fees, 0);
}

/** Realized net = gross profit + signed fees. */
export function netPnl(pnl: unknown, fees: unknown = 0): number {
  return asFiniteNumber(pnl, 0) + signedFees(fees);
}

export type TradePnlParts = {
  pnl: number;
  fees: number;
};

export type LedgerTotals = {
  tradeCount: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;
  avgWin: number | null;
  avgLoss: number | null;
};

export function sumLedger(trades: readonly TradePnlParts[]): LedgerTotals {
  let grossPnl = 0;
  let fees = 0;
  const winPnls: number[] = [];
  const lossPnls: number[] = [];
  let scratches = 0;

  for (const t of trades) {
    const gross = asFiniteNumber(t.pnl, 0);
    const fee = signedFees(t.fees);
    const net = gross + fee;
    grossPnl += gross;
    fees += fee;
    if (net > 0) winPnls.push(net);
    else if (net < 0) lossPnls.push(net);
    else scratches += 1;
  }

  const wins = winPnls.length;
  const losses = lossPnls.length;
  const decided = wins + losses;
  return {
    tradeCount: trades.length,
    grossPnl,
    fees,
    netPnl: grossPnl + fees,
    wins,
    losses,
    scratches,
    winRate: decided > 0 ? wins / decided : 0,
    avgWin: wins > 0 ? winPnls.reduce((a, b) => a + b, 0) / wins : null,
    avgLoss: losses > 0 ? lossPnls.reduce((a, b) => a + b, 0) / losses : null,
  };
}

export function formatSignedMoney(n: number, digits = 2): string {
  const body = n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return n > 0 ? `+${body}` : body;
}
