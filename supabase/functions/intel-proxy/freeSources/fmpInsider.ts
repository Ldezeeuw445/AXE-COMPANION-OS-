import {
  insiderTrade,
  mergeInsiderTrades,
  type InsiderTrade,
} from "./insiderDisclosure.ts";

export type FreeInsiderTrade = InsiderTrade;

type FetchFn = (
  url: string,
  timeoutMs?: number,
  headers?: Record<string, string>,
) => Promise<Response>;

export function mapFmpInsiderRow(r: Record<string, unknown>): FreeInsiderTrade | null {
  return insiderTrade({
    ticker: r.symbol ?? r.ticker,
    // `transactionType` is the Form 4 code (`P-Purchase`, `A-Award`, ...).
    // `acquistionOrDisposition` is deliberately not a fallback: it is `A` for
    // every grant and option exercise, which is not an insider buying.
    direction: r.transactionType ?? r.transactionCode,
    // `securitiesOwned` is deliberately not in this chain. FMP sends it on every
    // row and it is the holding *after* the filing, not the amount transacted —
    // using it as a fallback turns "sold 500 of their 2,000,000 shares" into a
    // $2M trade. A row with no transacted size is dropped instead.
    shares: r.securitiesTransacted ?? r.shares,
    price: r.price ?? r.sharePrice,
    value: r.value ?? r.totalValue,
    date: r.transactionDate ?? r.filingDate ?? r.date,
    insider: r.reportingName ?? r.insiderName ?? r.name ?? r.ownerName,
    role: r.typeOfOwner ?? r.reporterTitle ?? r.position,
  });
}

/**
 * FMP insider trading fallback (Form-4 style disclosures).
 * Tries stable + v4 endpoints; returns [] when key missing or all endpoints fail.
 */
export async function fetchInsiderTradesFromFmp(
  fmpKey: string,
  fetchWithTimeout: FetchFn,
  symbol?: string,
): Promise<FreeInsiderTrade[]> {
  if (!fmpKey.trim()) return [];

  const sym = symbol?.trim().toUpperCase();
  const urls = sym
    ? [
        `https://financialmodelingprep.com/stable/insider-trading-reported?symbol=${encodeURIComponent(sym)}&page=0&apikey=${fmpKey}`,
        `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(sym)}&page=0&apikey=${fmpKey}`,
      ]
    : [
        `https://financialmodelingprep.com/stable/insider-trading-latest?page=0&apikey=${fmpKey}`,
        `https://financialmodelingprep.com/api/v4/insider-trading?page=0&apikey=${fmpKey}`,
      ];

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 10_000);
      if (!res.ok) continue;
      const body = await res.json();
      const raw = Array.isArray(body)
        ? body
        : Array.isArray(body?.data)
          ? body.data
          : [];
      const trades = mergeInsiderTrades(
        (raw as Record<string, unknown>[])
          .map(mapFmpInsiderRow)
          .filter((t): t is FreeInsiderTrade => t != null),
      ).slice(0, 40);
      if (trades.length > 0) return trades;
    } catch {
      /* try next */
    }
  }
  return [];
}
