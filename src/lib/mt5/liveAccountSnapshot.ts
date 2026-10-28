import type { LivePositionPayload } from "@/lib/chart/liveContract";
import type { LiveEquitySnapshot } from "@/lib/risk/drawdownAlert";
import { asFiniteNumber } from "@/lib/journal/tradePnl";

export const ACCOUNT_LIVE_SYMBOL = "__account__";

export type Mt5PositionRow = {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string;
  type: string;
  volume: number;
  open_price: number;
  current_price: number;
  profit: number;
  swap: number;
  stop_loss: number | null;
  take_profit: number | null;
  opened_at: string | null;
  comment: string | null;
  updated_at: string;
};

export type LiveAccountFigures = {
  balance: number | null;
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  currency: string | null;
  profit: number | null;
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = asFiniteNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

export function isAccountLiveSymbol(symbol: string | null | undefined): boolean {
  const s = (symbol ?? "").trim().toUpperCase();
  return s === ACCOUNT_LIVE_SYMBOL.toUpperCase() || s === "ACCOUNT";
}

export function mapSide(t: string | undefined): "buy" | "sell" {
  return (t ?? "").toUpperCase().includes("BUY") ? "buy" : "sell";
}

export function mapMetaApiPosition(raw: Record<string, unknown>, index = 0): LivePositionPayload {
  return {
    id: String(raw.id ?? raw.positionId ?? index),
    symbol: String(raw.symbol ?? ""),
    side: mapSide(typeof raw.type === "string" ? raw.type : undefined),
    volume: Number(raw.volume ?? 0) || 0,
    entryPrice: num(raw.openPrice ?? raw.open_price),
    currentPrice: num(raw.currentPrice ?? raw.current_price ?? raw.price),
    profit: num(raw.profit ?? raw.unrealizedProfit),
    stopLoss: num(raw.stopLoss ?? raw.stop_loss),
    takeProfit: num(raw.takeProfit ?? raw.take_profit),
    openTime:
      (typeof raw.time === "string" && raw.time) ||
      (typeof raw.updateTime === "string" && raw.updateTime) ||
      (typeof raw.opened_at === "string" && raw.opened_at) ||
      null,
  };
}

export function positionsFromAccountMetadata(metadata: unknown): LivePositionPayload[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>).openPositions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p))
    .map((p, i) => mapMetaApiPosition(p, i))
    .filter((p) => p.symbol);
}

export function toMt5PositionRow(
  userId: string,
  accountId: string,
  position: LivePositionPayload,
  nowIso = new Date().toISOString(),
): Mt5PositionRow {
  const open = position.entryPrice ?? 0;
  const current = position.currentPrice ?? open;
  return {
    id: position.id || `${accountId}:${position.symbol}:${nowIso}`,
    user_id: userId,
    account_id: String(accountId),
    symbol: position.symbol,
    type: position.side === "buy" ? "buy" : "sell",
    volume: position.volume,
    open_price: open,
    current_price: current,
    profit: position.profit ?? 0,
    swap: 0,
    stop_loss: position.stopLoss,
    take_profit: position.takeProfit,
    opened_at: position.openTime,
    comment: null,
    updated_at: nowIso,
  };
}

export function figuresFromAccountInfo(info: Record<string, unknown> | null | undefined): LiveAccountFigures {
  const rec = info && typeof info === "object" ? info : {};
  return {
    balance: num(rec.balance),
    equity: num(rec.equity),
    margin: num(rec.margin),
    freeMargin: num(rec.freeMargin ?? rec.free_margin),
    marginLevel: num(rec.marginLevel ?? rec.margin_level),
    currency: typeof rec.currency === "string" ? rec.currency.trim().toUpperCase() : null,
    profit: num(rec.profit ?? rec.unrealizedProfit),
  };
}

export function figuresFromMetadata(metadata: unknown): LiveAccountFigures | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rec = metadata as Record<string, unknown>;
  const live = rec.liveAccountState;
  const summary = rec.accountSummary;
  const source =
    live && typeof live === "object" && !Array.isArray(live)
      ? (live as Record<string, unknown>)
      : summary && typeof summary === "object" && !Array.isArray(summary)
        ? (summary as Record<string, unknown>)
        : null;
  if (!source) return null;
  const figures = figuresFromAccountInfo(source);
  if (figures.balance == null && figures.equity == null) return null;
  return figures;
}

export function liveEquitySnapshotFromMetadata(
  metadata: unknown,
  figures: LiveAccountFigures,
): LiveEquitySnapshot | null {
  const equity = figures.equity ?? figures.balance;
  const balance = figures.balance ?? figures.equity;
  if (equity == null || balance == null) return null;

  const rec =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const live =
    rec.liveAccountState && typeof rec.liveAccountState === "object" && !Array.isArray(rec.liveAccountState)
      ? (rec.liveAccountState as Record<string, unknown>)
      : {};
  const summary =
    rec.accountSummary && typeof rec.accountSummary === "object" && !Array.isArray(rec.accountSummary)
      ? (rec.accountSummary as Record<string, unknown>)
      : {};

  return {
    equity,
    balance,
    dayStartBalance: num(live.dayStartBalance) ?? num(summary.balance) ?? balance,
    dayStartEquity: num(live.dayStartEquity) ?? num(summary.equity) ?? equity,
    initialBalance: num(live.initialBalance) ?? num(summary.balance) ?? balance,
    peakBalance: num(live.peakBalance) ?? Math.max(balance, equity),
  };
}

/** Roll day-start anchors when the UTC date changes; trail the peak. */
export function nextLiveAccountState(
  metadata: unknown,
  figures: LiveAccountFigures,
  now = new Date(),
): Record<string, unknown> {
  const rec =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prev =
    rec.liveAccountState && typeof rec.liveAccountState === "object" && !Array.isArray(rec.liveAccountState)
      ? { ...(rec.liveAccountState as Record<string, unknown>) }
      : {};
  const summary =
    rec.accountSummary && typeof rec.accountSummary === "object" && !Array.isArray(rec.accountSummary)
      ? (rec.accountSummary as Record<string, unknown>)
      : {};

  const day = now.toISOString().slice(0, 10);
  const prevDay = typeof prev.dayStartDate === "string" ? prev.dayStartDate : "";
  const equity = figures.equity ?? figures.balance;
  const balance = figures.balance ?? figures.equity;
  const rolled = prevDay !== day;

  const dayStartBalance = rolled
    ? (balance ?? num(prev.dayStartBalance) ?? num(summary.balance))
    : (num(prev.dayStartBalance) ?? balance ?? num(summary.balance));
  const dayStartEquity = rolled
    ? (equity ?? num(prev.dayStartEquity) ?? num(summary.equity))
    : (num(prev.dayStartEquity) ?? equity ?? num(summary.equity));
  const initialBalance = num(prev.initialBalance) ?? num(summary.balance) ?? balance;
  const peakBalance = Math.max(
    num(prev.peakBalance) ?? 0,
    balance ?? 0,
    equity ?? 0,
    initialBalance ?? 0,
  );

  rec.accountSummary = {
    ...summary,
    ...(figures.balance != null ? { balance: figures.balance } : {}),
    ...(figures.equity != null ? { equity: figures.equity } : {}),
    ...(figures.margin != null ? { margin: figures.margin } : {}),
    ...(figures.freeMargin != null ? { freeMargin: figures.freeMargin } : {}),
    ...(figures.marginLevel != null ? { marginLevel: figures.marginLevel } : {}),
    ...(figures.currency ? { currency: figures.currency } : {}),
  };
  rec.liveAccountState = {
    ...prev,
    ...figures,
    dayStartDate: day,
    dayStartBalance,
    dayStartEquity,
    initialBalance,
    peakBalance: peakBalance > 0 ? peakBalance : prev.peakBalance ?? null,
    updatedAt: now.toISOString(),
  };
  return rec;
}
