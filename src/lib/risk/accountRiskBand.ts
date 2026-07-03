export type RiskBandPosition = {
  id: string;
  symbol: string;
  side: "buy" | "sell" | string;
  volume: number;
  entryPrice: number;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPnl: number;
};

export type AccountRiskBandSnapshot = {
  equity: number;
  balance: number | null;
  currency: string | null;
  positionCount: number;
  withStopCount: number;
  withoutStopCount: number;
  /** Sum of $ loss if every SL is hit (positions without SL excluded). */
  totalLossIfAllSl: number;
  /** Sum of $ profit if every TP is hit (positions without TP excluded). */
  totalProfitIfAllTp: number;
  unrealizedPnl: number;
  /** Current open P&L as % of equity. */
  openPnlPercent: number;
  /** Worst case (all SL) as % of equity — negative number. */
  slScenarioPercent: number;
  /** Best case (all TP) as % of equity — positive number. */
  tpScenarioPercent: number;
  /** Net $ at risk from entry to SL for protected positions. */
  liveRiskDollars: number;
  /** liveRiskDollars as % of equity. */
  liveRiskPercent: number;
  maxRiskPercent: number;
  overMaxRisk: boolean;
};

/** Simplified $/price-unit per lot — matches demo trainer heuristics. */
export function pointValuePerLot(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU")) return 100;
  if (s.includes("XAG")) return 50;
  if (s.includes("BTC")) return 1;
  if (s.includes("ETH")) return 1;
  if (s.includes("JPY")) return 1000;
  if (s.includes("US30") || s.includes("US500") || s.includes("NAS100") || s.includes("SPX500")) {
    return 1;
  }
  if (s.length === 6) return 100_000;
  return 1;
}

function sideIsBuy(side: string): boolean {
  return side.toLowerCase().includes("buy");
}

function pnlAtPrice(
  side: string,
  entry: number,
  target: number,
  volume: number,
  symbol: string,
): number {
  const direction = sideIsBuy(side) ? 1 : -1;
  return (target - entry) * direction * pointValuePerLot(symbol) * volume;
}

export function computeAccountRiskBand(
  positions: RiskBandPosition[],
  opts: {
    equity: number;
    balance?: number | null;
    currency?: string | null;
    maxRiskPercent?: number;
  },
): AccountRiskBandSnapshot {
  const equity = opts.equity > 0 ? opts.equity : 1;
  const maxRiskPercent = opts.maxRiskPercent ?? 5;

  let totalLossIfAllSl = 0;
  let totalProfitIfAllTp = 0;
  let liveRiskDollars = 0;
  let unrealizedPnl = 0;
  let withStopCount = 0;
  let withoutStopCount = 0;

  for (const p of positions) {
    unrealizedPnl += p.unrealizedPnl;

    if (p.stopLoss != null && Number.isFinite(p.stopLoss)) {
      withStopCount += 1;
      const loss = pnlAtPrice(p.side, p.entryPrice, p.stopLoss, p.volume, p.symbol);
      if (loss < 0) {
        totalLossIfAllSl += loss;
        liveRiskDollars += Math.abs(loss);
      }
    } else {
      withoutStopCount += 1;
    }

    if (p.takeProfit != null && Number.isFinite(p.takeProfit)) {
      const gain = pnlAtPrice(p.side, p.entryPrice, p.takeProfit, p.volume, p.symbol);
      if (gain > 0) totalProfitIfAllTp += gain;
    }
  }

  const slScenarioPercent = (totalLossIfAllSl / equity) * 100;
  const tpScenarioPercent = (totalProfitIfAllTp / equity) * 100;
  const openPnlPercent = (unrealizedPnl / equity) * 100;
  const liveRiskPercent = (liveRiskDollars / equity) * 100;

  return {
    equity,
    balance: opts.balance ?? null,
    currency: opts.currency ?? null,
    positionCount: positions.length,
    withStopCount,
    withoutStopCount,
    totalLossIfAllSl,
    totalProfitIfAllTp,
    unrealizedPnl,
    openPnlPercent,
    slScenarioPercent,
    tpScenarioPercent,
    liveRiskDollars,
    liveRiskPercent,
    maxRiskPercent,
    overMaxRisk: liveRiskPercent > maxRiskPercent,
  };
}

export function formatRiskPercent(value: number, signed = false): string {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatRiskDollars(value: number): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? "−" : value > 0 ? "+" : "";
  if (abs >= 1000) return `${prefix}$${(abs / 1000).toFixed(1)}k`;
  return `${prefix}$${abs.toFixed(0)}`;
}
