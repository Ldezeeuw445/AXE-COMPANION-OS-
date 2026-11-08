/**
 * INTEL-FREE: what an insider trade is, for both insider feeds.
 *
 * SEC EDGAR Form 4 and FMP's insider endpoints both end up in
 * `intel_insider_trades`, and `readInsidersFromDb` serves that table back as
 * the stale fallback, so a wrong row outlives the fetch that made it. The
 * rules here are the ones a Form 4 actually supports:
 *
 * - Direction comes from the transaction code, and only `P` (open-market
 *   purchase) and `S` (open-market sale) are trades. `A` award, `M` option
 *   exercise, `F` tax withholding, `G` gift and the rest are not a view on the
 *   stock. The old FMP mapper read the acquired/disposed flag as a fallback —
 *   `A` became BUY, so every stock grant reached the intel view as an insider
 *   buying.
 * - The ticker has to look like one. EDGAR used to persist `"N/A"` for filings
 *   without `issuerTradingSymbol`, which then matched any symbol search for N.
 * - The date is the transaction's own `transactionDate`, not the filing's
 *   `periodOfReport`, and it is validated: `trade_date` is `date not null` and
 *   the upsert is one statement, so one bad date lost the batch.
 * - Several lots by the same insider on the same day are one trade, summed.
 *   They share the table's unique key; the old de-duplication kept the first
 *   lot and dropped the rest, so a 40,000-share sale in four fills showed as
 *   10,000.
 *
 * Pure and dependency-free so `npm test` can import this file as it ships —
 * see src/lib/intel/freeSources/insiderDisclosure.test.ts.
 */
import { congressTicker, congressTradeDate } from "./congressDisclosure.ts";

export type InsiderDirection = "BUY" | "SELL";

export type InsiderTrade = {
  ticker: string;
  insider: string;
  role?: string;
  type: InsiderDirection;
  shares?: number;
  value: number;
  date: string;
};

/**
 * `P-Purchase`, `S-Sale`, `S-Sale+OE`, a bare `P`/`S`, or the spelled-out
 * word. `null` for every other code, and for the bare `A`/`D` flag.
 */
export function insiderTradeDirection(
  raw: string | null | undefined,
): InsiderDirection | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  const code = /^([A-Z])(?:-|$)/.exec(v)?.[1];
  if (code) {
    if (code === "P") return "BUY";
    if (code === "S") return "SELL";
    return null;
  }
  if (v === "PURCHASE" || v === "BUY") return "BUY";
  if (v === "SALE" || v === "SELL") return "SELL";
  return null;
}

/** Same symbol shape and placeholder list as the congress feeds. */
export function insiderTicker(raw: string | null | undefined): string | null {
  // EDGAR sends `issuerTradingSymbol` as e.g. "BRK.A, BRK.B" for multi-class
  // issuers. Not split on spaces: "United States Treasury Bills" must stay a
  // sentence (and fail the shape check), not become the ticker UNITED.
  const first = String(raw ?? "").split(/[,;]/)[0].trim();
  return congressTicker(first);
}

export function insiderTradeDate(raw: string | null | undefined): string | null {
  return congressTradeDate(raw);
}

function positive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Builds a trade or returns `null`. No size at all is no information, so a
 * row with neither shares nor value is dropped rather than stored as $0.
 */
export function insiderTrade(input: {
  ticker: unknown;
  insider: unknown;
  role?: unknown;
  direction: unknown;
  shares?: unknown;
  price?: unknown;
  value?: unknown;
  date: unknown;
}): InsiderTrade | null {
  const ticker = insiderTicker(input.ticker == null ? "" : String(input.ticker));
  if (!ticker) return null;
  const type = insiderTradeDirection(input.direction == null ? "" : String(input.direction));
  if (!type) return null;
  const date = insiderTradeDate(input.date == null ? "" : String(input.date));
  if (!date) return null;

  const shares = Math.round(positive(Number(input.shares ?? 0)));
  const price = positive(Number(input.price ?? 0));
  const reported = positive(Number(input.value ?? 0));
  const value = reported > 0 ? reported : shares * price;
  if (!(value > 0) && !(shares > 0)) return null;

  const insider = String(input.insider ?? "").trim() || "Unknown";
  const role = String(input.role ?? "").trim() || undefined;

  return {
    ticker,
    insider,
    role,
    type,
    shares: shares > 0 ? shares : undefined,
    value: Math.round(value),
    date,
  };
}

/** One row per `(ticker, insider, date, type)` — the table's unique key — with lots summed. */
export function mergeInsiderTrades(trades: InsiderTrade[]): InsiderTrade[] {
  const byKey = new Map<string, InsiderTrade>();
  for (const t of trades) {
    const key = `${t.ticker}|${t.insider}|${t.date}|${t.type}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...t });
      continue;
    }
    const shares = (prev.shares ?? 0) + (t.shares ?? 0);
    prev.shares = shares > 0 ? shares : undefined;
    prev.value += t.value;
    prev.role = prev.role ?? t.role;
  }
  return [...byKey.values()];
}

/** The `<value>` inside `<tag>`, or the tag's own text, or "". */
export function form4Value(xml: string, tag: string): string {
  const outer = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!outer) return "";
  const inner = /<value>([\s\S]*?)<\/value>/i.exec(outer[1]);
  return (inner ? inner[1] : outer[1]).trim();
}

/** Every open-market trade in one Form 4 document, lots not yet merged. */
export function parseForm4Trades(xml: string): InsiderTrade[] {
  const ticker = form4Value(xml, "issuerTradingSymbol");
  const insider = form4Value(xml, "rptOwnerName");
  const role = form4Value(xml, "officerTitle");
  const filingDate = form4Value(xml, "periodOfReport");

  const trades: InsiderTrade[] = [];
  const txRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi;
  let match: RegExpExecArray | null;
  while ((match = txRegex.exec(xml)) !== null) {
    const tx = match[1];
    const trade = insiderTrade({
      ticker,
      insider,
      role,
      direction: form4Value(tx, "transactionCode"),
      shares: form4Value(tx, "transactionShares"),
      price: form4Value(tx, "transactionPricePerShare"),
      date: form4Value(tx, "transactionDate") || filingDate,
    });
    if (trade) trades.push(trade);
  }
  return trades;
}

/** Exact symbol only: a search for `F` is Ford, not every ticker starting with F. */
export function insiderTradesForSymbol(
  trades: InsiderTrade[],
  symbol?: string,
): InsiderTrade[] {
  const sym = symbol?.trim().toUpperCase();
  return sym ? trades.filter((t) => t.ticker === sym) : trades;
}
