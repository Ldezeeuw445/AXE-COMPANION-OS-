export type FreeCongressTrade = {
  politician: string;
  chamber: string;
  ticker: string;
  direction: "BUY" | "SELL";
  size: string;
  date: string;
};

type FetchFn = (
  url: string,
  timeoutMs?: number,
  headers?: Record<string, string>,
) => Promise<Response>;

/** Pure FMP senate/house row → FreeCongressTrade (offline-testable). */
export function mapCongressRow(
  r: Record<string, unknown>,
  defaultChamber: string,
): FreeCongressTrade | null {
  const type = String(r.type ?? r.transactionType ?? r.transaction ?? "").toLowerCase();
  const isPurchase =
    type.includes("purchase") || type.includes("buy") || type.includes("acquisition");
  const politician =
    `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
    String(r.representative ?? r.senator ?? r.name ?? "Unknown");
  const ticker = String(r.symbol ?? r.ticker ?? r.assetDescription ?? "")
    .toUpperCase()
    .trim();
  const date = String(
    r.transactionDate ?? r.disclosureDate ?? r.dateRecieved ?? r.dateReceived ?? r.date ?? "",
  ).slice(0, 10);
  if (!ticker || !date) return null;

  return {
    politician,
    chamber: String(r.office ?? r.chamber ?? defaultChamber),
    ticker,
    direction: isPurchase ? "BUY" : "SELL",
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
