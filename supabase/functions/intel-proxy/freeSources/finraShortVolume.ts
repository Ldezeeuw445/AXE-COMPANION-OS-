/**
 * FINRA daily short sale volume via CDN Reg SHO CNMS files (no API key).
 */

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

function isoFromYyyymmdd(s: string): string {
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function candidateDates(count = 6): string[] {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(yyyymmdd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

export function parseFinraShortVolumeText(
  text: string,
  opts?: { symbol?: string; limit?: number },
): FreeShortVolume[] {
  const symbolFilter = opts?.symbol?.trim().toUpperCase();
  const limit = opts?.limit ?? 40;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: FreeShortVolume[] = [];

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
    if (!symbolFilter && rows.length >= limit) break;
  }

  if (symbolFilter) return rows.slice(0, limit);
  return rows
    .sort((a, b) => b.shortRatio - a.shortRatio || b.shortVolume - a.shortVolume)
    .slice(0, limit);
}

export async function fetchFinraShortVolume(
  fetchWithTimeout: FetchFn,
  symbol?: string,
): Promise<FreeShortVolume[]> {
  const dates = candidateDates(6);
  let lastError: string | null = null;

  for (const d of dates) {
    const url = `https://cdn.finra.org/equity/regsho/daily/CNMS${d}.txt`;
    try {
      const res = await fetchWithTimeout(url, 12_000, {
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
