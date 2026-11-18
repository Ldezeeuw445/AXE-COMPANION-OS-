/**
 * Price alerts written by Trading OS into `user_alerts` (any source).
 * Companion's cron evaluates them and pushes. No Companion-only metadata
 * is required: symbol + above/below + a numeric level is enough.
 */

import { cleanDisplaySymbol } from "@/lib/broker/symbolResolution";

export type PriceAlertRow = {
  id: string;
  user_id?: string;
  symbol: string | null;
  type: string;
  condition: string | null;
  threshold: number | string | null;
  status: string;
  triggered_at: string | null;
  account_id?: string | null;
  metadata: Record<string, unknown> | null;
};

const TOS_SYMBOL_TO_DISPLAY: Record<string, string> = {
  QQQ: "NAS100",
  SPY: "SPX500",
  DIA: "US30",
  NASDAQ100: "NAS100",
  NASDAQ: "NAS100",
  NDX: "NAS100",
  NDX100: "NAS100",
};

const DISPLAY_TO_CANONICAL: Record<string, string> = {
  NASDAQ: "NAS100",
  US100: "NAS100",
  USTEC: "NAS100",
  NDX100: "NAS100",
  US500: "SPX500",
  SPX: "SPX500",
  SP500: "SPX500",
};

export function normalizeAlertSymbol(symbol: string | null | undefined): string {
  const raw = (symbol ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (TOS_SYMBOL_TO_DISPLAY[compact]) return TOS_SYMBOL_TO_DISPLAY[compact];
  const cleaned = cleanDisplaySymbol(raw) || compact;
  return DISPLAY_TO_CANONICAL[cleaned] ?? cleaned;
}

export function alertSymbolsMatch(
  alertSymbol: string | null | undefined,
  quoteSymbol: string | null | undefined,
): boolean {
  const a = normalizeAlertSymbol(alertSymbol);
  const b = normalizeAlertSymbol(quoteSymbol);
  return Boolean(a && b && a === b);
}

function metadataOf(row: PriceAlertRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
}

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function readPriceThreshold(row: PriceAlertRow): number | null {
  const fromCol = numeric(row.threshold);
  if (fromCol != null) return fromCol;
  const meta = metadataOf(row);
  return numeric(meta.price) ?? numeric(meta.threshold);
}

export function readPriceCondition(row: PriceAlertRow): "above" | "below" | null {
  const raw = String(row.condition ?? metadataOf(row).condition ?? "")
    .trim()
    .toLowerCase();
  if (raw === "above" || raw === "gte" || raw === ">=" || raw === "greater") return "above";
  if (raw === "below" || raw === "lte" || raw === "<=" || raw === "less") return "below";
  return null;
}

export function isEvaluablePriceAlert(row: PriceAlertRow): boolean {
  if (row.status !== "active") return false;
  if (String(row.type ?? "").toLowerCase() !== "price") return false;
  if (!normalizeAlertSymbol(row.symbol)) return false;
  if (readPriceThreshold(row) == null) return false;
  if (readPriceCondition(row) == null) return false;
  return true;
}

export function shouldFirePriceCross(args: {
  previousPrice: number | null;
  price: number;
  condition: "above" | "below";
  threshold: number;
}): boolean {
  if (args.previousPrice == null || !Number.isFinite(args.previousPrice) || !Number.isFinite(args.price)) {
    return false;
  }
  if (args.condition === "above") {
    return args.previousPrice < args.threshold && args.price >= args.threshold;
  }
  return args.previousPrice > args.threshold && args.price <= args.threshold;
}

export function readLastEvalPrice(row: PriceAlertRow): number | null {
  return numeric(metadataOf(row).last_eval_price);
}

export function withLastEvalPrice(
  row: PriceAlertRow,
  price: number,
  nowIso: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...metadataOf(row),
    ...extra,
    last_eval_price: price,
    last_evaluated_at: nowIso,
  };
}

export type SnapshotQuoteRow = {
  display_symbol?: string | null;
  last_price?: number | string | null;
  last_bid?: number | string | null;
  last_ask?: number | string | null;
  timeframe?: string | null;
};

export function quotesFromSnapshots(rows: SnapshotQuoteRow[]): Record<string, number> {
  const quoteTf = rows.filter((r) => String(r.timeframe ?? "").toLowerCase() === "quote");
  const source = quoteTf.length > 0 ? quoteTf : rows;
  const out: Record<string, number> = {};
  for (const row of source) {
    const key = normalizeAlertSymbol(row.display_symbol);
    if (!key || out[key] != null) continue;
    const midBid = numeric(row.last_bid);
    const midAsk = numeric(row.last_ask);
    const mid = midBid != null && midAsk != null ? (midBid + midAsk) / 2 : null;
    const price = numeric(row.last_price) ?? mid ?? midBid ?? midAsk;
    if (price != null) out[key] = price;
  }
  return out;
}

export function priceAlertCooldownSeconds(row: PriceAlertRow): number {
  const n = numeric(metadataOf(row).cooldown_seconds);
  if (n != null && n >= 5) return Math.min(n, 86_400);
  return 300;
}

export type PriceAlertAction =
  | { kind: "baseline"; alert: PriceAlertRow; price: number }
  | { kind: "fire"; alert: PriceAlertRow; price: number; condition: "above" | "below"; threshold: number; message: string };

/**
 * Decide what the cron should do for each evaluable alert given current quotes
 * keyed by Companion display symbol (already normalized).
 */
export function planPriceAlertActions(
  alerts: PriceAlertRow[],
  quotes: Record<string, number>,
): PriceAlertAction[] {
  const out: PriceAlertAction[] = [];
  for (const alert of alerts) {
    if (!isEvaluablePriceAlert(alert)) continue;
    const symbol = normalizeAlertSymbol(alert.symbol);
    const price = quotes[symbol];
    if (price == null || !Number.isFinite(price)) continue;
    const threshold = readPriceThreshold(alert);
    const condition = readPriceCondition(alert);
    if (threshold == null || !condition) continue;
    const previous = readLastEvalPrice(alert);
    if (previous == null) {
      out.push({ kind: "baseline", alert, price });
      continue;
    }
    if (shouldFirePriceCross({ previousPrice: previous, price, condition, threshold })) {
      out.push({
        kind: "fire",
        alert,
        price,
        condition,
        threshold,
        message: `${symbol} ${condition} ${threshold} (now ${price})`,
      });
    } else {
      out.push({ kind: "baseline", alert, price });
    }
  }
  return out;
}
