/**
 * Alpha Vantage CONGRESS_TRADES → `intel_congress_trades` rows.
 *
 * Why this exists: `intel_congress_trades` has been a table nothing writes to
 * since Unusual Whales came out. The intel page reads it, finds nothing, and
 * says "No congressional feed yet." Alpha Vantage serves the same disclosures
 * for free — House *and* Senate, filed under the STOCK Act — so the feed can
 * come back without a subscription.
 *
 * Shapes here follow a live response (NVDA, 2026-10-15): 439 trades, newest
 * filing the day before. Field names are the API's, not ours.
 *
 * Dependency-free so `node --experimental-strip-types` can exercise it.
 */

/** One trade as Alpha Vantage returns it. Everything is optional: this is
 *  someone else's API and a missing field must drop a row, not throw. */
export type AlphaVantageCongressTrade = {
  chamber?: string | null;
  politician?: string | null;
  politician_canonical?: string | null;
  party?: string | null;
  symbol?: string | null;
  asset_name?: string | null;
  transaction_type?: string | null;
  transaction_date?: string | null;
  notification_date?: string | null;
  amount_min?: string | number | null;
  amount_max?: string | number | null;
};

/** A row as `intel_congress_trades` wants it. */
export type CongressTradeRow = {
  politician: string;
  chamber: string;
  party: string | null;
  ticker: string;
  asset_description: string | null;
  /** The table has a CHECK constraint: only these two values exist. */
  trade_type: "BUY" | "SELL";
  amount_range: string | null;
  trade_date: string;
  disclosure_date: string | null;
  source: string;
};

export const CONGRESS_TRADES_SOURCE = "alphavantage";

/**
 * Disclosure forms use a dozen words for two directions. Anything that is not
 * clearly one of them is dropped rather than guessed: a wrong direction on a
 * politician's trade is worse than a missing row, and the CHECK constraint
 * would reject it anyway.
 */
export function normalizeDirection(raw: string | null | undefined): "BUY" | "SELL" | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.includes("PURCHASE") || v === "BUY" || v === "P") return "BUY";
  // "PARTIAL_SALE" and "SALE_FULL" are still sales.
  if (v.includes("SALE") || v.includes("SELL") || v === "S") return "SELL";
  // EXCHANGE, RECEIVE, and the blanks: not a direction we can act on.
  return null;
}

function money(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** "$1,001 - $15,000" — the band the filing actually discloses, never a
 *  midpoint. Congress reports ranges; inventing a number would be a lie. */
export function formatAmountRange(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): string | null {
  const lo = money(min);
  const hi = money(max);
  if (lo === null && hi === null) return null;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  if (lo !== null && hi !== null) return lo === hi ? fmt(lo) : `${fmt(lo)} - ${fmt(hi)}`;
  return lo !== null ? `${fmt(lo)}+` : `up to ${fmt(hi as number)}`;
}

/** "HOUSE" → "House". The column defaults to 'Senate', so an unknown chamber
 *  must not silently inherit that and mislabel a representative. */
export function normalizeChamber(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (v.startsWith("HOUSE")) return "House";
  if (v.startsWith("SENATE")) return "Senate";
  return null;
}

/** YYYY-MM-DD or nothing. A `date` column will reject anything else. */
function isoDate(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export type MapResult = {
  rows: CongressTradeRow[];
  /** How many the API sent that we could not use, and why. Counted rather
   *  than swallowed: a sync that drops 400 of 439 rows is broken, and the
   *  cron log should say so instead of reporting success. */
  skipped: { noDirection: number; noTicker: number; noDate: number; noPolitician: number };
};

export function mapCongressTrades(trades: readonly AlphaVantageCongressTrade[]): MapResult {
  const rows: CongressTradeRow[] = [];
  const skipped = { noDirection: 0, noTicker: 0, noDate: 0, noPolitician: 0 };

  for (const t of trades) {
    const politician = (t.politician_canonical ?? t.politician ?? "").trim();
    if (!politician) {
      skipped.noPolitician += 1;
      continue;
    }
    const ticker = (t.symbol ?? "").trim().toUpperCase();
    if (!ticker) {
      skipped.noTicker += 1;
      continue;
    }
    const tradeDate = isoDate(t.transaction_date);
    if (!tradeDate) {
      skipped.noDate += 1;
      continue;
    }
    const direction = normalizeDirection(t.transaction_type);
    if (!direction) {
      skipped.noDirection += 1;
      continue;
    }

    rows.push({
      politician,
      chamber: normalizeChamber(t.chamber) ?? "Senate",
      party: (t.party ?? "").trim() || null,
      ticker,
      asset_description: (t.asset_name ?? "").trim() || null,
      trade_type: direction,
      amount_range: formatAmountRange(t.amount_min, t.amount_max),
      trade_date: tradeDate,
      disclosure_date: isoDate(t.notification_date),
      source: CONGRESS_TRADES_SOURCE,
    });
  }

  return { rows, skipped };
}

/**
 * The unique index is (politician, ticker, trade_date, trade_type,
 * coalesce(amount_range, '')). Two filings that agree on all five are the same
 * disclosure arriving twice, so collapse them before the upsert rather than
 * letting Postgres reject the whole batch.
 */
export function dedupe(rows: readonly CongressTradeRow[]): CongressTradeRow[] {
  const seen = new Map<string, CongressTradeRow>();
  for (const r of rows) {
    const key = [r.politician, r.ticker, r.trade_date, r.trade_type, r.amount_range ?? ""].join("\u0000");
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}
