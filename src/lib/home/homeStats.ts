import { netPnl } from "@/lib/journal/tradePnl";

export type Filterable = {
  accountId?: string | null;
  symbol?: string | null;
  symbols?: string[] | null;
};

export function matchesHomeFilter(
  row: Filterable,
  accountId: string,
  pair: string,
): boolean {
  if (accountId !== "all" && row.accountId && row.accountId !== accountId) return false;
  if (pair === "ALL") return true;
  const needle = pair.toUpperCase();
  if (row.symbols && row.symbols.length > 0) {
    return row.symbols.some((s) => !s || s === "*" || s.toUpperCase() === needle);
  }
  if (!row.symbol) return true;
  return row.symbol.toUpperCase() === needle;
}

export type HomePositionLike = {
  side: string;
  volume: number;
  openPrice: number | null;
  currentPrice: number | null;
  pnl: number | null;
  stopLoss: number | null;
};

/**
 * Approximate dollar risk if every stop is hit, using live P/L vs price
 * distance as the dollar-per-price unit. Positions without a stop or a
 * usable price move are skipped (unknown, not invented).
 */
export function openRiskToStops(positions: readonly HomePositionLike[]): number | null {
  let total = 0;
  let counted = 0;
  for (const p of positions) {
    if (p.side === "pend" || p.side === "pending") continue;
    if (p.stopLoss == null || p.openPrice == null || p.currentPrice == null) continue;
    if (p.pnl == null || !Number.isFinite(p.pnl)) continue;
    const move = p.currentPrice - p.openPrice;
    if (Math.abs(move) < 1e-12) continue;
    const dollarsPerPrice = p.pnl / move;
    const riskMove = p.openPrice - p.stopLoss;
    const risk = Math.abs(dollarsPerPrice * riskMove);
    if (!Number.isFinite(risk)) continue;
    total += risk;
    counted += 1;
  }
  return counted > 0 ? total : null;
}

export function openPnlSum(positions: readonly { pnl: number | null; side: string }[]): number {
  return positions.reduce((sum, p) => {
    if (p.side === "pend" || p.side === "pending") return sum;
    return sum + (p.pnl ?? 0);
  }, 0);
}

export type PerformanceStats = {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  profitFactor: number | null;
  avg: number | null;
  best: number | null;
  maxDd: number | null;
  net: number;
  equity: number[];
};

export function performanceStats(
  trades: readonly { pnl: number; fees?: number }[],
): PerformanceStats {
  const nets = trades.map((t) => netPnl(t.pnl, t.fees ?? 0));
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n < 0);
  const gp = wins.reduce((a, n) => a + n, 0);
  const gl = Math.abs(losses.reduce((a, n) => a + n, 0));
  const net = nets.reduce((a, n) => a + n, 0);
  const equity: number[] = [];
  let run = 0;
  let peak = 0;
  let maxDd = 0;
  for (const n of [...nets].reverse()) {
    run += n;
    equity.push(run);
    if (run > peak) peak = run;
    const dd = peak - run;
    if (dd > maxDd) maxDd = dd;
  }
  return {
    count: nets.length,
    wins: wins.length,
    losses: losses.length,
    winRate: nets.length ? wins.length / nets.length : null,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? null : nets.length ? 0 : null,
    avg: nets.length ? net / nets.length : null,
    best: nets.length ? Math.max(...nets) : null,
    maxDd: nets.length ? maxDd : null,
    net,
    equity,
  };
}

export function dayKey(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  if (!timeZone) return new Date(t).toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

export function localDayKey(date: Date, timeZone?: string): string {
  if (!timeZone) return date.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function calendarMonthPnl(
  trades: readonly { closeTime: string | null; pnl: number; fees?: number }[],
  year: number,
  monthIndex: number,
  timeZone?: string,
): Record<number, number> {
  const map: Record<number, number> = {};
  for (const t of trades) {
    if (!t.closeTime) continue;
    const d = new Date(t.closeTime);
    if (!Number.isFinite(d.getTime())) continue;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(d);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    if (y !== year || m !== monthIndex + 1) continue;
    map[day] = (map[day] ?? 0) + netPnl(t.pnl, t.fees ?? 0);
  }
  return map;
}

export function equityPolyline(values: number[], width = 320, height = 88): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const padTop = 8;
  const padBot = 18;
  const h = height - padTop - padBot;
  const step = values.length === 1 ? width : width / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = padTop + (1 - (v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1];
  const lastX = last?.split(",")[0] ?? String(width);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${lastX},${height} L0,${height} Z`;
  return { line, area };
}
