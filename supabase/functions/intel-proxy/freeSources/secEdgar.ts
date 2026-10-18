/**
 * SEC EDGAR Form 4 insider trades (free, no API key).
 * Uses EFTS search + Form 4 XML from Archives.
 * Pure XML helpers are exported for unit tests without network.
 */

export type EdgarInsiderTrade = {
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

const SEC_HEADERS = {
  "User-Agent": "AXE-Companion-OS support@axecompanion.com",
  Accept: "application/json",
};

/** Read a Form 4 tag — prefers nested <value>, else direct text. */
export function xmlVal(xml: string, tag: string): string {
  const outerRe = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "i");
  const outerMatch = xml.match(outerRe);
  if (!outerMatch) return "";
  const inner = outerMatch[0];
  const valMatch = inner.match(/<value>([\s\S]*?)<\/value>/i);
  if (valMatch) return valMatch[1].trim();
  const directMatch = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return directMatch ? directMatch[1].trim() : "";
}

/**
 * Parse non-derivative P/S transactions from one Form 4 XML body.
 * Skips codes other than purchase (P) / sale (S).
 */
export function parseForm4Xml(xml: string): EdgarInsiderTrade[] {
  const ticker = xmlVal(xml, "issuerTradingSymbol").split(/[\s,]+/)[0].toUpperCase();
  const insiderName = xmlVal(xml, "rptOwnerName");
  const officerTitle = xmlVal(xml, "officerTitle") || undefined;
  const txDate = xmlVal(xml, "periodOfReport") || xmlVal(xml, "transactionDate");

  const trades: EdgarInsiderTrade[] = [];
  const txRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi;
  let txMatch;
  while ((txMatch = txRegex.exec(xml)) !== null) {
    const txXml = txMatch[1];
    const code = xmlVal(txXml, "transactionCode").toUpperCase();
    if (code !== "P" && code !== "S") continue;
    const shares = Math.round(Number(xmlVal(txXml, "transactionShares")) || 0);
    const price = Number(xmlVal(txXml, "transactionPricePerShare")) || 0;
    const value = Math.round(shares * price);
    if (value <= 0 && shares <= 0) continue;
    trades.push({
      ticker: ticker || "N/A",
      insider: insiderName || "Unknown",
      role: officerTitle,
      type: code === "P" ? "BUY" : "SELL",
      shares: shares > 0 ? shares : undefined,
      value,
      date: txDate,
    });
  }
  return trades;
}

/** Dedupe + sort by value; optional ticker filter. */
export function finalizeEdgarTrades(
  trades: EdgarInsiderTrade[],
  symbol?: string,
  limit = 25,
): EdgarInsiderTrade[] {
  const seen = new Set<string>();
  const unique = trades.filter((t) => {
    const key = `${t.insider}:${t.ticker}:${t.date}:${t.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => b.value - a.value);

  const filtered = symbol
    ? unique.filter((t) => t.ticker === symbol || t.ticker.startsWith(symbol))
    : unique;
  return filtered.slice(0, limit);
}

/**
 * Fetch recent Form 4 insider trades from SEC EDGAR (free).
 */
export async function fetchInsiderTradesFromEdgar(
  fetchWithTimeout: FetchFn,
  symbol?: string,
): Promise<EdgarInsiderTrade[]> {
  const now = new Date();
  const lookback = new Date(now.getTime() - 30 * 86400 * 1000);
  const endDt = now.toISOString().slice(0, 10);
  const startDt = lookback.toISOString().slice(0, 10);

  const query = symbol ? encodeURIComponent(`"${symbol}"`) : "";
  const eftsUrl =
    `https://efts.sec.gov/LATEST/search-index?q=${query}&forms=4` +
    `&dateRange=custom&startdt=${startDt}&enddt=${endDt}&from=0&size=15`;

  const eftsRes = await fetchWithTimeout(eftsUrl, 8000, SEC_HEADERS);
  if (!eftsRes.ok) throw new Error(`edgar_efts_${eftsRes.status}`);

  const eftsData = await eftsRes.json();
  const hits = eftsData?.hits?.hits;
  if (!Array.isArray(hits) || hits.length === 0) return [];

  type FilingRef = { xmlUrl: string; displayNames: string[] };
  const filingRefs: FilingRef[] = [];

  for (const hit of hits.slice(0, 12)) {
    const src = hit._source;
    const id = hit._id as string;
    const [adsh, filename] = id.split(":");
    if (!adsh || !filename) continue;
    const ciks = src?.ciks as string[] | undefined;
    if (!ciks || ciks.length === 0) continue;
    const cik = ciks[0].replace(/^0+/, "");
    const adshNoDash = adsh.replace(/-/g, "");
    filingRefs.push({
      xmlUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${adshNoDash}/${filename}`,
      displayNames: (src?.display_names as string[]) ?? [],
    });
  }

  const xmlResults = await Promise.all(
    filingRefs.map(async (ref) => {
      try {
        const res = await fetchWithTimeout(ref.xmlUrl, 6000, SEC_HEADERS);
        if (!res.ok) return null;
        return { xml: await res.text(), ref };
      } catch {
        return null;
      }
    }),
  );

  const trades: EdgarInsiderTrade[] = [];
  for (const result of xmlResults) {
    if (!result) continue;
    trades.push(...parseForm4Xml(result.xml));
  }

  return finalizeEdgarTrades(trades, symbol);
}
