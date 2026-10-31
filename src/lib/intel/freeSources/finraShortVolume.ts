/**
 * FINRA daily short sale volume (CNMS Reg SHO file).
 * Spec: Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
 * CDN: https://cdn.finra.org/equity/regsho/daily/CNMSyyyymmdd.txt
 */

export type FinraShortVolumeRow = {
  symbol: string;
  date: string;
  shortVolume: number;
  shortExemptVolume: number;
  totalVolume: number;
  shortRatio: number;
  market: string;
};

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function isoFromYyyymmdd(s: string): string {
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
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

/**
 * Parse a FINRA CNMS daily short sale volume file (pipe or comma delimited).
 *
 * The file is alphabetical, so the market-wide list has to read every row
 * before ranking — cutting at `limit` first would rank only the A-names.
 */
export function parseFinraShortVolumeText(
  text: string,
  opts?: { symbol?: string; limit?: number; minTotalVolume?: number },
): FinraShortVolumeRow[] {
  const symbolFilter = opts?.symbol?.trim().toUpperCase();
  const limit = opts?.limit ?? 40;
  const minTotalVolume = symbolFilter ? 0 : (opts?.minTotalVolume ?? FINRA_TOP_MIN_TOTAL_VOLUME);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: FinraShortVolumeRow[] = [];

  for (const line of lines) {
    if (/^date[|,]/i.test(line) || /^symbol[|,]/i.test(line)) continue;
    const parts = line.includes("|") ? line.split("|") : line.split(",");
    if (parts.length < 5) continue;

    const dateRaw = parts[0].trim();
    const symbol = parts[1].trim().toUpperCase();
    if (!symbol) continue;
    if (symbolFilter && symbol !== symbolFilter) continue;

    const shortVolume = Number(parts[2]);
    const shortExemptVolume = Number(parts[3]);
    const totalVolume = Number(parts[4]);
    const market = (parts[5] ?? "CNMS").trim() || "CNMS";
    if (![shortVolume, shortExemptVolume, totalVolume].every((n) => Number.isFinite(n))) continue;
    if (totalVolume < minTotalVolume) continue;

    const shortRatio = totalVolume > 0 ? shortVolume / totalVolume : 0;
    rows.push({
      symbol,
      date: dateRaw.includes("-") ? dateRaw.slice(0, 10) : isoFromYyyymmdd(dateRaw),
      shortVolume,
      shortExemptVolume,
      totalVolume,
      shortRatio,
      market,
    });
  }

  if (symbolFilter) return rows.slice(0, limit);
  return rows
    .sort((a, b) => b.shortRatio - a.shortRatio || b.shortVolume - a.shortVolume)
    .slice(0, limit);
}
