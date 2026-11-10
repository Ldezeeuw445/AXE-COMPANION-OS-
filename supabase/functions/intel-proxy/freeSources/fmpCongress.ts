import {
  congressTicker,
  congressTradeDate,
  congressTradeDirection,
  type CongressDirection,
} from "./congressDisclosure.ts";

export type FreeCongressTrade = {
  politician: string;
  chamber: string;
  ticker: string;
  direction: CongressDirection;
  size: string;
  date: string;
};

type FetchFn = (
  url: string,
  timeoutMs?: number,
  headers?: Record<string, string>,
) => Promise<Response>;

function mapCongressRow(
  r: Record<string, unknown>,
  defaultChamber: string,
): FreeCongressTrade | null {
  // Direction, ticker and date all drop the row when the filing does not
  // actually disclose one — see freeSources/congressDisclosure.ts. The ticker
  // chain deliberately stops at `symbol`/`ticker`: `assetDescription` is prose,
  // not a symbol.
  const direction = congressTradeDirection(
    String(r.type ?? r.transactionType ?? r.transaction ?? ""),
  );
  if (!direction) return null;

  const ticker = congressTicker(String(r.symbol ?? r.ticker ?? ""));
  if (!ticker) return null;

  const date = congressTradeDate(
    String(r.transactionDate ?? r.disclosureDate ?? r.dateRecieved ?? r.dateReceived ?? r.date ?? ""),
  );
  if (!date) return null;

  const politician =
    `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
    String(r.representative ?? r.senator ?? r.name ?? "Unknown");

  return {
    politician,
    chamber: String(r.office ?? r.chamber ?? defaultChamber),
    ticker,
    direction,
    size: String(r.amount ?? r.range ?? r.amountRange ?? "N/A"),
    date,
  };
}

async function fetchChamber(
  urls: string[],
  defaultChamber: string,
  fetchWithTimeout: FetchFn,
): Promise<FreeCongressTrade[]> {
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 8_000);
      if (!res.ok) continue;
      const body = await res.json();
      const raw = Array.isArray(body)
        ? body
        : Array.isArray(body?.data)
          ? body.data
          : [];
      if (!Array.isArray(raw) || raw.length === 0) continue;
      const trades = (raw as Record<string, unknown>[])
        .map((r) => mapCongressRow(r, defaultChamber))
        .filter((t): t is FreeCongressTrade => t != null)
        .slice(0, 25);
      if (trades.length > 0) return trades;
    } catch {
      /* try next */
    }
  }
  return [];
}

/**
 * FMP senate + house trading. Merges both chambers, newest first, deduped.
 */
export async function fetchCongressFromFmpSenateAndHouse(
  fmpKey: string,
  fetchWithTimeout: FetchFn,
): Promise<FreeCongressTrade[]> {
  if (!fmpKey.trim()) return [];

  const [senate, house] = await Promise.all([
    fetchChamber(
      [
        `https://financialmodelingprep.com/api/v4/senate-trading?apikey=${fmpKey}`,
        `https://financialmodelingprep.com/stable/senate-trading?page=0&apikey=${fmpKey}`,
        `https://financialmodelingprep.com/api/v3/senate-trading?apikey=${fmpKey}`,
      ],
      "Senate",
      fetchWithTimeout,
    ),
    fetchChamber(
      [
        `https://financialmodelingprep.com/api/v4/house-disclosure?apikey=${fmpKey}`,
        `https://financialmodelingprep.com/stable/house-trading?page=0&apikey=${fmpKey}`,
        `https://financialmodelingprep.com/api/v4/house-trading?apikey=${fmpKey}`,
      ],
      "House",
      fetchWithTimeout,
    ),
  ]);

  const merged = [...senate, ...house];
  const seen = new Set<string>();
  const out: FreeCongressTrade[] = [];
  for (const t of merged.sort((a, b) => b.date.localeCompare(a.date))) {
    const key = `${t.politician}|${t.ticker}|${t.date}|${t.direction}|${t.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 40) break;
  }
  return out;
}
