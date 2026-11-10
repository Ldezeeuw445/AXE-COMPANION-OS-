/**
 * FINRA daily short sale volume via CDN Reg SHO CNMS files (no API key).
 * Spec: Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
 *
 * Pure TypeScript with relative imports only: npm test imports this file
 * directly (src/lib/intel/freeSources/finraShortVolume.test.ts), so there is
 * no second copy to drift.
 */
import { congressTradeDate } from "./congressDisclosure.ts";

export type FreeShortVolume = {
  symbol: string;
  date: string;
  shortVolume: number;
  shortExemptVolume: number;
  totalVolume: number;
  shortRatio: number;
  market: string;
};

type FetchFn = (
  url: string,
  timeoutMs?: number,
  headers?: Record<string, string>,
) => Promise<Response>;

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** `20260703` / `2026-07-03` → `2026-07-03`; anything that isn't a real day → `null`. */
function finraTradeDate(raw: string): string | null {
  const v = raw.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  return congressTradeDate(compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : v);
}

/** Candidate trade dates (skip weekends), newest first. */
export function finraCandidateDates(from: Date = new Date(), count = 6): string[] {
  const out: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(yyyymmdd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

export function finraShortVolumeUrl(yyyymmddDate: string): string {
  return `https://cdn.finra.org/equity/regsho/daily/CNMS${yyyymmddDate}.txt`;
}

/**
 * Market-wide ranking ignores names that traded fewer shares than this. Without
 * a floor, a ticker that printed 200 shares — all short — ranks 100% and pushes
 * every liquid name off the list. A requested symbol is never filtered.
 */
export const FINRA_TOP_MIN_TOTAL_VOLUME = 500_000;

function rankByShortRatio(rows: FreeShortVolume[], limit: number): FreeShortVolume[] {
  return [...rows]
    .sort((a, b) => b.shortRatio - a.shortRatio || b.shortVolume - a.shortVolume)
    .slice(0, limit);
}

/**
 * The file is alphabetical, so the market-wide list has to read every row
 * before ranking — cutting at `limit` first would rank only the A-names.
 */
export function parseFinraShortVolumeText(
  text: string,
  opts?: { symbol?: string; limit?: number; minTotalVolume?: number },
): FreeShortVolume[] {
  const symbolFilter = opts?.symbol?.trim().toUpperCase();
  const limit = opts?.limit ?? 40;
  const minTotalVolume = symbolFilter ? 0 : (opts?.minTotalVolume ?? FINRA_TOP_MIN_TOTAL_VOLUME);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: FreeShortVolume[] = [];

  for (const line of lines) {
    if (/^date[|,]/i.test(line) || /^symbol[|,]/i.test(line)) continue;
    const parts = line.includes("|") ? line.split("|") : line.split(",");
    if (parts.length < 5) continue;

    const symbol = parts[1].trim().toUpperCase();
    if (!symbol) continue;
    if (symbolFilter && symbol !== symbolFilter) continue;
    // `trade_date` is `date not null` and the upsert is one statement: one bad
    // date would lose the whole batch, so the row goes instead.
    const date = finraTradeDate(parts[0]);
    if (!date) continue;

    const shortVolume = Number(parts[2]);
    const shortExemptVolume = Number(parts[3]);
    const totalVolume = Number(parts[4]);
    const market = (parts[5] ?? "CNMS").trim() || "CNMS";
    if (![shortVolume, shortExemptVolume, totalVolume].every((n) => Number.isFinite(n))) continue;
    if (totalVolume < minTotalVolume) continue;

    const shortRatio = totalVolume > 0 ? shortVolume / totalVolume : 0;
    rows.push({ symbol, date, shortVolume, shortExemptVolume, totalVolume, shortRatio, market });
  }

  if (symbolFilter) return rows.slice(0, limit);
  return rankByShortRatio(rows, limit);
}

/**
 * A trade date with at least this many stored rows was written by a
 * market-wide fetch (up to 40 rows); a symbol lookup writes one row per day.
 */
export const FINRA_TOP_MIN_LIST_ROWS = 10;

/**
 * Rebuilds the market-wide list from `intel_short_volume`. The table holds
 * every day ever fetched plus single rows from symbol lookups, so a plain
 * "newest first" read mixes days, lists a symbol once per day and lets a thin
 * name someone looked up rank 100%. This keeps one trade date — the newest one
 * a market-wide fetch wrote — and applies the same floor and ranking as FINRA.
 */
export function shortVolumeTopFromStored(
  rows: FreeShortVolume[],
  limit = 40,
): FreeShortVolume[] {
  const liquid = rows.filter(
    (r) => finraTradeDate(r.date) !== null && r.totalVolume >= FINRA_TOP_MIN_TOTAL_VOLUME,
  );
  const perDate = new Map<string, number>();
  for (const r of liquid) perDate.set(r.date, (perDate.get(r.date) ?? 0) + 1);
  const dates = [...perDate.keys()].sort().reverse();
  const listDate =
    dates.find((d) => (perDate.get(d) ?? 0) >= FINRA_TOP_MIN_LIST_ROWS) ?? dates[0];
  if (!listDate) return [];
  return rankByShortRatio(liquid.filter((r) => r.date === listDate), limit);
}

export async function fetchFinraShortVolume(
  fetchWithTimeout: FetchFn,
  symbol?: string,
): Promise<FreeShortVolume[]> {
  const dates = finraCandidateDates(new Date(), 6);
  let lastError: string | null = null;

  for (const d of dates) {
    try {
      const res = await fetchWithTimeout(finraShortVolumeUrl(d), 12_000, {
        Accept: "text/plain,*/*",
        "User-Agent": "AXE-Companion-OS support@axecompanion.com",
      });
      if (res.status === 404) {
        lastError = `finra_not_published_${d}`;
        continue;
      }
      if (!res.ok) {
        lastError = `finra_http_${res.status}`;
        continue;
      }
      const text = await res.text();
      const rows = parseFinraShortVolumeText(text, { symbol, limit: 40 });
      if (rows.length > 0) return rows;
      lastError = symbol ? `finra_symbol_missing_${symbol}` : "finra_empty_file";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(lastError ?? "finra_short_volume_unavailable");
}
