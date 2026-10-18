/**
 * Free public Congress trades — Senate + House Stock Watcher APIs (no API key).
 * Pure mappers are exported for unit tests without network.
 */

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

/** Map one Senate Stock Watcher transaction row. */
export function mapSenateWatcherRow(r: Record<string, unknown>): FreeCongressTrade | null {
  const txType = String(r.type ?? r.transaction_type ?? "").toLowerCase();
  const isPurchase = txType.includes("purchase") || txType.includes("buy");
  const ticker = String(r.ticker ?? r.symbol ?? "").trim().toUpperCase();
  const date = String(r.transaction_date ?? r.date ?? r.filing_date ?? "").slice(0, 10);
  if (!ticker || !date) return null;
  return {
    politician: String(r.senator ?? r.name ?? r.representative ?? "Unknown"),
    chamber: "Senate",
    ticker,
    direction: isPurchase ? "BUY" : "SELL",
    size: String(r.amount_range ?? r.range ?? r.amount ?? "N/A"),
    date,
  };
}

/** Map one House Stock Watcher transaction row. */
export function mapHouseWatcherRow(r: Record<string, unknown>): FreeCongressTrade | null {
  const txType = String(r.type ?? r.transaction_type ?? "").toLowerCase();
  const isPurchase = txType.includes("purchase") || txType.includes("buy");
  const ticker = String(r.ticker ?? r.symbol ?? "").trim().toUpperCase();
  const date = String(r.transaction_date ?? r.date ?? r.filing_date ?? "").slice(0, 10);
  if (!ticker || !date) return null;
  return {
    politician: String(r.representative ?? r.name ?? r.senator ?? "Unknown"),
    chamber: "House",
    ticker,
    direction: isPurchase ? "BUY" : "SELL",
    size: String(r.amount_range ?? r.range ?? r.amount ?? "N/A"),
    date,
  };
}

/** Deduplicate and keep the 25 most recent disclosures. */
export function dedupeCongressTrades(results: FreeCongressTrade[], limit = 25): FreeCongressTrade[] {
  const seen = new Set<string>();
  return results
    .filter((t) => {
      const key = `${t.politician}|${t.ticker}|${t.date}|${t.direction}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

/**
 * Fetch recent Senate + House disclosures from free public watchers.
 * Throws `free_public_empty` when both sources yield nothing.
 */
export async function fetchCongressFromFreeSources(
  fetchWithTimeout: FetchFn,
): Promise<FreeCongressTrade[]> {
  const results: FreeCongressTrade[] = [];

  try {
    const senateRes = await fetchWithTimeout(
      "https://senatestockwatcher.com/api/v1/transactions",
      12_000,
    );
    if (senateRes.ok) {
      const body = (await senateRes.json()) as Array<Record<string, unknown>>;
      const raw = Array.isArray(body) ? body : [];
      for (const row of raw.slice(0, 25)) {
        const mapped = mapSenateWatcherRow(row);
        if (mapped) results.push(mapped);
      }
    }
  } catch {
    /* ignore — house may still succeed */
  }

  try {
    const houseRes = await fetchWithTimeout(
      "https://housestockwatcher.com/api/v1/transactions",
      12_000,
    );
    if (houseRes.ok) {
      const body = (await houseRes.json()) as Array<Record<string, unknown>>;
      const raw = Array.isArray(body) ? body : [];
      for (const row of raw.slice(0, 25)) {
        const mapped = mapHouseWatcherRow(row);
        if (mapped) results.push(mapped);
      }
    }
  } catch {
    /* ignore */
  }

  const unique = dedupeCongressTrades(results);
  if (unique.length === 0) throw new Error("free_public_empty");
  return unique;
}
