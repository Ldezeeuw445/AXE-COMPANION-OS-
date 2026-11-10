/**
 * INTEL-FREE: one row of a congress feed → one `intel_congress_trades` row.
 *
 * `intel-proxy` reads Congress from four feeds, and the per-row mapping for
 * three of them lived inline in `index.ts`: a 2,800-line Deno file with remote
 * URL imports, so it is outside `tsconfig.json`'s `include` and no test runner
 * can import it. The mapping was therefore neither typechecked by
 * `npm run typecheck` nor covered by `npm test` — which is how four copies of
 * `isPurchase ? "BUY" : "SELL"` survived in it.
 *
 * The repo already had the answer for the fourth feed: FMP's mapper lives in
 * `freeSources/fmpCongress.ts` precisely so it can be mirrored and tested. This
 * file does the same for the other three. `index.ts` keeps the fetching, the
 * endpoint fallbacks and the caching; the decisions live here.
 *
 * Field names are each API's own, not ours, and every one is optional: these
 * are someone else's responses and a missing field must drop a row rather than
 * throw. What a row has to carry to be usable is decided in one place,
 * `congressDisclosure.ts`.
 *
 * The deployed intel-proxy lives only in trading-os-app (#149). This module is
 * the tested mapper this app keeps for congress row shapes.
 *
 * Dependency-free, so `node --test` can exercise it directly.
 */

import {
  congressTicker,
  congressTradeDate,
  congressTradeDirection,
  type CongressDirection,
} from "./congressDisclosure";

export type CongressFeedTrade = {
  politician: string;
  chamber: string;
  ticker: string;
  direction: CongressDirection;
  size: string;
  date: string;
};

type Row = Record<string, unknown>;

/** `null` unless the row names a ticker, a real date and an actual direction. */
function build(
  politician: string,
  chamber: string,
  rawTicker: string,
  rawDirection: string,
  size: string,
  rawDate: string,
): CongressFeedTrade | null {
  const ticker = congressTicker(rawTicker);
  if (!ticker) return null;
  const direction = congressTradeDirection(rawDirection);
  if (!direction) return null;
  const date = congressTradeDate(rawDate);
  if (!date) return null;
  return { politician, chamber, ticker, direction, size, date };
}

function str(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const v = String(c).trim();
    if (v) return v;
  }
  return "";
}

/** Unusual Whales `/api/congress/recent-trades` — only read when subscribed. */
export function mapUnusualWhalesCongressRow(r: Row): CongressFeedTrade | null {
  return build(
    str(r.politician, r.representative, r.name) || "Unknown",
    // `party` is last on purpose: it is a poor chamber, but it is what the
    // response carries when `chamber` and `house` are both absent.
    str(r.chamber, r.house, r.party) || "Congress",
    str(r.ticker, r.symbol, r.asset_ticker),
    str(r.transaction_type, r.type, r.trade_type),
    str(r.amount, r.range, r.transaction_amount) || "N/A",
    str(r.transaction_date, r.trade_date, r.filed_date, r.date),
  );
}

/**
 * Quiver `bulk/congresstrading` and the legacy `live/congresstrading`. The two
 * endpoints disagree about capitalisation, so both spellings are read.
 */
export function mapQuiverCongressRow(r: Row): CongressFeedTrade | null {
  return build(
    str(r.Representative, r.representative, r.Name, r.name, r.Politician) || "Unknown",
    str(r.House, r.house, r.Chamber, r.chamber) || "Congress",
    str(r.Ticker, r.ticker, r.Symbol, r.symbol),
    str(r.Transaction, r.transaction, r.TradeType, r.trade_type),
    str(r.Range, r.range, r.Amount, r.amount, r.transaction_amount) || "N/A",
    str(r.TransactionDate, r.transaction_date, r.Traded, r.traded, r.Filed, r.filed, r.Date, r.date),
  );
}

/**
 * Senate Stock Watcher and House Stock Watcher. Same response shape, different
 * name for the filer, and the chamber comes from which URL was fetched rather
 * than from the row — so it is passed in rather than guessed.
 */
export function mapStockWatcherRow(r: Row, chamber: "Senate" | "House"): CongressFeedTrade | null {
  const politician =
    chamber === "Senate"
      ? str(r.senator, r.name, r.representative)
      : str(r.representative, r.name, r.senator);
  return build(
    politician || "Unknown",
    chamber,
    str(r.ticker, r.symbol),
    str(r.type, r.transaction_type),
    str(r.amount_range, r.range, r.amount) || "N/A",
    str(r.transaction_date, r.date, r.filing_date),
  );
}

/**
 * The unique index on `intel_congress_trades` is
 * `(politician, ticker, trade_date, trade_type, coalesce(amount_range, ''))`.
 * Two feeds reporting the same filing are one row, so collapse them here
 * instead of letting Postgres reject the batch they travel in.
 */
export function dedupeCongressTrades(
  trades: readonly CongressFeedTrade[],
  limit = 25,
): CongressFeedTrade[] {
  const seen = new Set<string>();
  const out: CongressFeedTrade[] = [];
  for (const t of [...trades].sort((a, b) => b.date.localeCompare(a.date))) {
    const key = [t.politician, t.ticker, t.date, t.direction, t.size].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
