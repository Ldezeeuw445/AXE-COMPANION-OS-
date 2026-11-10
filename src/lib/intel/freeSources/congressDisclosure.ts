/**
 * INTEL-FREE: the three fields a congressional disclosure has to get right.
 *
 * `intel-proxy` reads Congress from four feeds — FMP senate/house, Senate and
 * House Stock Watcher, Quiver, and Unusual Whales when it is subscribed — and
 * every one of them had its own copy of the same three lines:
 *
 *     const isPurchase = type.includes("purchase") || type.includes("buy");
 *     direction: isPurchase ? "BUY" : "SELL",
 *     ticker: String(r.symbol ?? r.ticker ?? r.assetDescription ?? ""),
 *
 * Both lines are wrong in the same direction: they guess instead of dropping.
 *
 *   - A STOCK Act filing is not two-valued. The forms carry `Exchange`,
 *     `Receive`, and a bare `--` alongside the purchases and sales, and the
 *     ternary turns every one of them into a **SELL**. That is not a missing
 *     row, it is a wrong one: the intel view tells a trader a senator sold a
 *     name they only transferred between their own accounts. `src/lib/intel/
 *     congressTrades.ts` already decided this question for the Alpha Vantage
 *     cron ("a wrong direction on a politician's trade is worse than a missing
 *     row") and drops unknowns. This is that rule, shared.
 *   - Disclosures cover assets that have no ticker — treasuries, funds, real
 *     estate — and the feeds signal that with `""`, `--` or `N/A`. FMP's mapper
 *     fell back to `assetDescription`, so `ticker` became an upper-cased
 *     sentence ("UNITED STATES TREASURY BILLS") on a column the UI renders as a
 *     symbol and `intel_congress_trades` indexes.
 *
 * Dates get the same treatment for a sharper reason: `trade_date` is a
 * `date not null` column, the upsert is one statement for all 25 rows, and
 * `persistCongressTrades` swallows its own errors. One `--` in one row therefore
 * loses the whole batch, silently. Validating here means that row drops and the
 * other 24 land.
 *
 * The deployed intel-proxy lives only in trading-os-app (#149). This module is
 * the tested rule set this app uses when it maps congress rows itself.
 *
 * Dependency-free, so `node --test` can exercise it directly.
 */

export type CongressDirection = "BUY" | "SELL";

/**
 * Words the feeds use for "this asset has no ticker". Deliberately short: a
 * placeholder list that over-reaches starts discarding real symbols, so bare
 * `NA` is left off it (National Australia Bank trades under it) and only the
 * unambiguous fillers are here.
 */
const TICKER_PLACEHOLDERS = new Set([
  "--",
  "-",
  "—",
  "–",
  "N/A",
  "NONE",
  "NULL",
  "UNKNOWN",
]);

/** `BRK.B` and `BF-B` are real; a sentence, a dollar amount, or `--` is not. */
const TICKER_SHAPE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * The direction a filing actually discloses, or `null` when it discloses
 * something else.
 *
 * Covers every spelling the four feeds use: FMP senate (`Purchase`,
 * `Sale (Full)`, `Sale (Partial)`), FMP house (`purchase`, `sale_full`,
 * `sale_partial`), the Stock Watchers (`Purchase`, `Sale`), Quiver
 * (`Purchase`, `Sale`), Unusual Whales (`buy`, `sell`), and the Form-4 style
 * single letters and acquisition/disposition wording that the insider feeds
 * share with these.
 *
 * `Exchange`, `Receive`, `Gift`, `--` and `""` return `null` on purpose.
 */
export function congressTradeDirection(
  raw: string | null | undefined,
): CongressDirection | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  // The single letters some feeds send, checked before the substring rules so
  // that "PARTIAL_SALE" still reads as a sale below.
  if (v === "P") return "BUY";
  if (v === "S") return "SELL";
  if (v.includes("PURCHASE") || v.includes("BUY") || v.includes("ACQUISITION")) return "BUY";
  if (v.includes("SALE") || v.includes("SELL") || v.includes("DISPOSITION")) return "SELL";
  // EXCHANGE, RECEIVE, GIFT, CONVERSION, and the blanks: not a direction a
  // trader can act on, and not one worth inventing.
  return null;
}

/**
 * The ticker a filing names, upper-cased, or `null` when it names an asset that
 * has none.
 *
 * Upper-casing matters beyond tidiness: House Stock Watcher sends lower-case
 * symbols and FMP sends upper-case, and `intel_congress_trades` is unique on
 * `(politician, ticker, trade_date, trade_type, amount_range)`. Left as they
 * arrive, the same disclosure from two feeds is two rows.
 */
export function congressTicker(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v || TICKER_PLACEHOLDERS.has(v)) return null;
  return TICKER_SHAPE.test(v) ? v : null;
}

/**
 * `YYYY-MM-DD`, or `null` when the value is not a real calendar date.
 *
 * Accepts the ISO the feeds mostly send (with or without a time suffix) and the
 * `M/D/YYYY` that House Stock Watcher still emits on some rows. A date that
 * parses but does not round-trip — `2026-02-30`, `13/01/2026` — is rejected
 * rather than let Postgres reject the batch it travels in.
 */
export function congressTradeDate(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (us) return calendarDate(Number(us[3]), Number(us[1]), Number(us[2]));

  return null;
}

/** Round-trips through UTC so an overflowing day or month fails instead of rolling over. */
function calendarDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
