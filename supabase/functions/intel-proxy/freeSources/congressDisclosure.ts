/**
 * INTEL-FREE: direction, ticker and date rules for congressional disclosures.
 *
 * Mirrors src/lib/intel/freeSources/congressDisclosure.ts, which is the tested
 * copy and carries the full reasoning. Deno cannot import from `src/`, so the
 * rules live twice; `congressDisclosure.test.ts` on the app side asserts the
 * two have not drifted.
 *
 * The short version of why these exist: every congress mapper in this function
 * used to do `isPurchase ? "BUY" : "SELL"`, which reports an `Exchange` or a
 * `Receive` as a sale, and FMP's mapper fell back to `assetDescription` for the
 * ticker, which put upper-cased sentences in a symbol column. Unknowns drop
 * here instead of being guessed.
 */

export type CongressDirection = "BUY" | "SELL";

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

const TICKER_SHAPE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** `null` for `Exchange`, `Receive`, `Gift` and the blanks — not a guess. */
export function congressTradeDirection(
  raw: string | null | undefined,
): CongressDirection | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v === "P") return "BUY";
  if (v === "S") return "SELL";
  if (v.includes("PURCHASE") || v.includes("BUY") || v.includes("ACQUISITION")) return "BUY";
  if (v.includes("SALE") || v.includes("SELL") || v.includes("DISPOSITION")) return "SELL";
  return null;
}

/** Upper-cased so two feeds spelling the same symbol are one row, not two. */
export function congressTicker(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v || TICKER_PLACEHOLDERS.has(v)) return null;
  return TICKER_SHAPE.test(v) ? v : null;
}

/** `YYYY-MM-DD` or `null`. `trade_date` is `date not null` and the upsert is one statement. */
export function congressTradeDate(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (us) return calendarDate(Number(us[3]), Number(us[1]), Number(us[2]));

  return null;
}

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
