import type { AxeCompanionContext, TradingSpaceContext } from "@/types/context";

type TradingSpaceInput = Omit<AxeCompanionContext, "tradingSpace" | "summary">;

export function buildTradingSpaceContext(
  ctx: TradingSpaceInput,
  extras?: {
    pendingExecutions?: TradingSpaceContext["pendingExecutions"];
    cockpitAlignment?: string | null;
  },
): TradingSpaceContext {
  const symbol = ctx.symbol?.toUpperCase() ?? ctx.chart.symbol?.toUpperCase() ?? null;
  const symbolTrades = symbol
    ? ctx.trades.recentTrades
        .filter((t) => t.symbol.toUpperCase().replace(/\.[A-Z]+$/i, "") === symbol.replace(/\.[A-Z]+$/i, ""))
        .slice(0, 8)
        .map((t) => ({
          symbol: t.symbol,
          side: t.side,
          pnl: t.pnl,
          closeTime: t.close_time,
        }))
    : ctx.trades.recentTrades.slice(0, 5).map((t) => ({
        symbol: t.symbol,
        side: t.side,
        pnl: t.pnl,
        closeTime: t.close_time,
      }));

  const symbolLabels = symbol
    ? ctx.trades.labels
        .filter((l) => l.symbol.toUpperCase().replace(/\.[A-Z]+$/i, "") === symbol.replace(/\.[A-Z]+$/i, ""))
        .map((l) => l.label ?? "")
        .filter(Boolean)
        .slice(0, 6)
    : ctx.trades.recurringLabels.slice(0, 6);

  const openPositions = ctx.chart.relatedOpenPositions.map((p) => ({
    symbol: p.symbol,
    side: p.side,
    volume: p.volume,
    entryPrice: p.entryPrice,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    profit: p.profit,
  }));

  const lines: string[] = [];
  lines.push(`Trading space @ ${ctx.generatedAt}`);
  if (ctx.accounts.activeLabel) {
    lines.push(`Account: ${ctx.accounts.activeLabel} (${ctx.accounts.accountHealth})`);
  }
  if (symbol) lines.push(`Focus pair: ${symbol}${ctx.timeframe ? ` ${ctx.timeframe}` : ""}`);
  if (openPositions.length > 0) {
    lines.push(
      `Open: ${openPositions.map((p) => `${p.symbol} ${p.side} ${p.volume}lot SL:${p.stopLoss ?? "—"} TP:${p.takeProfit ?? "—"}`).join(" | ")}`,
    );
  } else {
    lines.push("Open: flat on chart-linked positions");
  }
  if ((extras?.pendingExecutions?.length ?? 0) > 0) {
    lines.push(
      `Pending approvals: ${extras!.pendingExecutions!.map((e) => `${e.instrument} ${e.direction} @${e.entry ?? "mkt"}`).join(" | ")}`,
    );
  }
  if (symbolTrades.length > 0) {
    const pnlSum = symbolTrades.reduce((s, t) => s + t.pnl, 0);
    lines.push(`Recent ${symbol ?? "account"} trades: ${symbolTrades.length}, net P/L ${pnlSum.toFixed(2)}`);
  }
  if (symbolLabels.length > 0) lines.push(`Labels: ${symbolLabels.join(", ")}`);
  if (ctx.trades.riskPatterns.length > 0) lines.push(`Risk patterns: ${ctx.trades.riskPatterns.slice(0, 3).join(" | ")}`);
  if (ctx.alerts.active > 0) lines.push(`Active alerts: ${ctx.alerts.active}`);
  if (extras?.cockpitAlignment) lines.push(`Cockpit: ${extras.cockpitAlignment}`);
  if (ctx.correlations.length > 0) {
    lines.push(`Watch: ${ctx.correlations.slice(0, 2).map((c) => c.message).join(" | ")}`);
  }

  return {
    generatedAt: ctx.generatedAt,
    activeAccountId: ctx.accounts.activeAccountId,
    activeAccountLabel: ctx.accounts.activeLabel,
    symbol,
    timeframe: ctx.timeframe,
    openPositions,
    pendingExecutions: extras?.pendingExecutions ?? [],
    symbolTrades,
    symbolLabels,
    activeAlerts: ctx.alerts.active,
    cockpitAlignment: extras?.cockpitAlignment ?? null,
    riskPatterns: ctx.trades.riskPatterns,
    compactBrief: lines.join("\n").slice(0, 2_500),
  };
}

export function formatTradingSpaceForPrompt(space: TradingSpaceContext): string {
  return `TRADING SPACE (pair + account + exposure aware — use naturally, do not recite mechanically)\n${space.compactBrief}`;
}
