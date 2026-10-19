export type FreeInsiderTrade = {
  ticker: string;
  insider: string;
  role?: string;
  type: "BUY" | "SELL";
  shares?: number;
  value: number;
  date: string;
};

type FetchFn = (
  url: string,
  timeoutMs?: number,
  headers?: Record<string, string>,
) => Promise<Response>;

/** Pure FMP → FreeInsiderTrade mapper (offline-testable). */
export function mapFmpInsiderRow(r: Record<string, unknown>): FreeInsiderTrade | null {
  const ticker = String(r.symbol ?? r.ticker ?? "").toUpperCase().trim();
  if (!ticker) return null;

  const tx = String(
    r.transactionType ?? r.acquistionOrDisposition ?? r.type ?? r.transactionCode ?? "",
  ).toLowerCase();
  const isBuy =
    tx.includes("purchase") ||
    tx.includes("buy") ||
    tx === "a" ||
    tx.includes("acquisition") ||
    tx.includes("p-purchase");
  const isSell =
    tx.includes("sale") ||
    tx.includes("sell") ||
    tx === "d" ||
    tx.includes("disposition") ||
    tx.includes("s-sale");
  if (!isBuy && !isSell) return null;

  const shares = Number(r.securitiesTransacted ?? r.shares ?? r.securitiesOwned ?? 0);
  const price = Number(r.price ?? r.sharePrice ?? 0);
  const valueRaw = Number(r.value ?? r.totalValue ?? 0);
  const value = valueRaw > 0 ? valueRaw : Math.max(0, shares) * Math.max(0, price);

  const date = String(
    r.transactionDate ?? r.filingDate ?? r.date ?? r.reportingDate ?? "",
  ).slice(0, 10);
  if (!date) return null;

  const insider = String(
    r.reportingName ?? r.insiderName ?? r.name ?? r.ownerName ?? "Unknown",
  ).trim();
  const role = String(r.typeOfOwner ?? r.reporterTitle ?? r.position ?? "").trim() || undefined;

  return {
    ticker,
    insider: insider || "Unknown",
    role,
    type: isBuy ? "BUY" : "SELL",
    shares: Number.isFinite(shares) && shares > 0 ? Math.round(shares) : undefined,
    value: Number.isFinite(value) ? value : 0,
    date,
  };
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
      const trades = (raw as Record<string, unknown>[])
        .map(mapFmpInsiderRow)
        .filter((t): t is FreeInsiderTrade => t != null)
        .slice(0, 40);
      if (trades.length > 0) return trades;
    } catch {
      /* try next */
    }
  }
  return [];
}
