// supabase/functions/intel-proxy/index.ts
// ─────────────────────────────────────────────────────────────────────
// AXE Intel Proxy — Supabase Edge Function (v2)
// 
// Providers:
//   • Insider trades   → SEC EDGAR (free, no API key)
//   • Congress trades   → FMP /stable/ (paid plan) → graceful fallback
//   • Dark pool prints  → Finnhub volume anomaly detection (free)
//   • Unusual options   → Finnhub recommendation trends (free)
//   • Market tide       → Finnhub aggregate sentiment (free)
//
// Deploy:  supabase functions deploy intel-proxy --no-verify-jwt
// Secrets: FINNHUB_API_KEY (required)
//          FMP_API_KEY (optional — enables congress feed)
// ─────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── In-memory cache (persists while function instance is warm) ──────
type CacheEntry = { data: unknown; ts: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

function cached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.data as T;
}
function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Shared fetch with timeout ──────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  timeoutMs = 10_000,
  headers?: Record<string, string>,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: headers ?? {},
    });
  } finally {
    clearTimeout(timer);
  }
}

// SEC EDGAR requires a User-Agent header with contact info
const SEC_HEADERS = {
  "User-Agent": "AXE-Companion-OS support@axecompanion.com",
  Accept: "application/json",
};

// ── XML helper: extract text between tags ──────────────────────────
function xmlVal(xml: string, tag: string): string {
  // Match <tag>...<value>X</value>...</tag> or <tag>X</tag>
  const outerRe = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "i");
  const outerMatch = xml.match(outerRe);
  if (!outerMatch) return "";
  const inner = outerMatch[0];
  // Try <value>X</value> first (Form 4 nesting)
  const valMatch = inner.match(/<value>([\s\S]*?)<\/value>/i);
  if (valMatch) return valMatch[1].trim();
  // Fallback: direct text content
  const directMatch = inner.match(
    new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return directMatch ? directMatch[1].trim() : "";
}

// ═══════════════════════════════════════════════════════════════════
// 1. INSIDER TRADES — SEC EDGAR (free, no API key)
// ═══════════════════════════════════════════════════════════════════
// Flow: EFTS search for recent Form 4 filings → fetch individual
// Form 4 XMLs → parse transaction details.
// ═══════════════════════════════════════════════════════════════════
type InsiderTrade = {
  ticker: string;
  insider: string;
  role?: string;
  type: "BUY" | "SELL";
  shares?: number;
  value: number;
  date: string;
};

async function handleInsiderTrades(
  symbol?: string,
): Promise<Response> {
  const cacheKey = `insider:${symbol ?? "all"}`;
  const hit = cached<InsiderTrade[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  try {
    // Step 1: Search EDGAR EFTS for recent Form 4 filings
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400 * 1000);
    const endDt = now.toISOString().slice(0, 10);
    const startDt = weekAgo.toISOString().slice(0, 10);

    // If symbol provided, search for it; otherwise get recent filings
    const query = symbol
      ? encodeURIComponent(`"${symbol}"`)
      : "%22%22";

    const eftsUrl =
      `https://efts.sec.gov/LATEST/search-index?q=${query}&forms=4` +
      `&dateRange=custom&startdt=${startDt}&enddt=${endDt}&from=0&size=12`;

    const eftsRes = await fetchWithTimeout(eftsUrl, 8000, SEC_HEADERS);
    if (!eftsRes.ok) {
      return json(
        { ok: false, error: `edgar_efts_${eftsRes.status}` },
        502,
      );
    }

    const eftsData = await eftsRes.json();
    const hits = eftsData?.hits?.hits;
    if (!Array.isArray(hits) || hits.length === 0) {
      return json({ ok: true, data: [] });
    }

    // Step 2: Build XML URLs from EFTS hits
    type FilingRef = { xmlUrl: string; displayNames: string[] };
    const filingRefs: FilingRef[] = [];

    for (const hit of hits.slice(0, 10)) {
      const src = hit._source;
      const id = hit._id as string; // "ADSH:filename.xml"
      const [adsh, filename] = id.split(":");
      if (!adsh || !filename) continue;

      const ciks = src?.ciks as string[] | undefined;
      if (!ciks || ciks.length === 0) continue;

      // Use first CIK (reporting owner) — strip leading zeros for URL
      const cik = ciks[0].replace(/^0+/, "");
      const adshNoDash = adsh.replace(/-/g, "");

      filingRefs.push({
        xmlUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${adshNoDash}/${filename}`,
        displayNames: (src?.display_names as string[]) ?? [],
      });
    }

    // Step 3: Fetch Form 4 XMLs in parallel (max 8 concurrent)
    const xmlPromises = filingRefs.map(async (ref) => {
      try {
        const res = await fetchWithTimeout(ref.xmlUrl, 6000, SEC_HEADERS);
        if (!res.ok) return null;
        const xml = await res.text();
        return { xml, ref };
      } catch {
        return null;
      }
    });

    const xmlResults = await Promise.all(xmlPromises);

    // Step 4: Parse each Form 4 XML
    const trades: InsiderTrade[] = [];

    for (const result of xmlResults) {
      if (!result) continue;
      const { xml } = result;

      // Extract issuer info
      const ticker = xmlVal(xml, "issuerTradingSymbol")
        .split(/[\s,]+/)[0] // Take first ticker if multiple
        .toUpperCase();
      const insiderName = xmlVal(xml, "rptOwnerName");
      const officerTitle = xmlVal(xml, "officerTitle") || undefined;
      const txDate =
        xmlVal(xml, "periodOfReport") ||
        xmlVal(xml, "transactionDate");

      // Parse all nonDerivativeTransactions
      const txRegex =
        /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi;
      let txMatch;
      while ((txMatch = txRegex.exec(xml)) !== null) {
        const txXml = txMatch[1];
        const code = xmlVal(txXml, "transactionCode").toUpperCase();
        // P = Purchase, S = Sale — skip awards (A), gifts (G), etc.
        if (code !== "P" && code !== "S") continue;

        const shares = Math.round(
          Number(xmlVal(txXml, "transactionShares")) || 0,
        );
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
    }

    // De-duplicate (same insider + same ticker + same date = one entry)
    const seen = new Set<string>();
    const uniqueTrades = trades.filter((t) => {
      const key = `${t.insider}:${t.ticker}:${t.date}:${t.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by value descending
    uniqueTrades.sort((a, b) => b.value - a.value);

    // If symbol filter was set, double-check that results match
    const filtered = symbol
      ? uniqueTrades.filter(
          (t) =>
            t.ticker === symbol ||
            t.ticker.startsWith(symbol),
        )
      : uniqueTrades;

    const result = filtered.slice(0, 25);
    setCache(cacheKey, result);
    return json({ ok: true, data: result });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. SENATE / CONGRESS TRADES — FMP /stable/ (paid) with fallback
// ═══════════════════════════════════════════════════════════════════
type SenateTrade = {
  politician: string;
  chamber: string;
  ticker: string;
  direction: "BUY" | "SELL";
  size: string;
  date: string;
};

async function handleSenateTrades(): Promise<Response> {
  const cacheKey = "senate:all";
  const hit = cached<SenateTrade[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  const fmpKey = Deno.env.get("FMP_API_KEY");
  if (!fmpKey) {
    return json({
      ok: false,
      error: "FMP_API_KEY not configured — congress feed requires FMP Starter plan ($22/mo) at financialmodelingprep.com",
    }, 503);
  }

  try {
    // Use the new /stable/ base URL (replaces legacy /api/v4/)
    const params = new URLSearchParams({ page: "0", apikey: fmpKey });
    const res = await fetchWithTimeout(
      `https://financialmodelingprep.com/stable/senate-trading?${params}`,
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Check for legacy/paid-only error
      if (
        body.includes("Legacy") ||
        body.includes("not available") ||
        body.includes("Upgrade") ||
        res.status === 403 ||
        res.status === 402
      ) {
        return json({
          ok: false,
          error: "congress_feed_requires_paid_plan",
          message: "Congress trading data requires FMP Starter plan or higher. Visit financialmodelingprep.com to upgrade.",
        }, 402);
      }
      return json(
        { ok: false, error: `fmp_senate_${res.status}` },
        502,
      );
    }

    const raw = (await res.json()) as Array<Record<string, unknown>>;

    // Check for error response in JSON body
    if (!Array.isArray(raw)) {
      const errMsg = (raw as Record<string, unknown>)?.["Error Message"];
      if (errMsg && String(errMsg).includes("Legacy")) {
        return json({
          ok: false,
          error: "congress_feed_requires_paid_plan",
          message: "Congress trading data requires FMP Starter plan or higher. Visit financialmodelingprep.com to upgrade.",
        }, 402);
      }
      return json({ ok: false, error: "fmp_senate_bad_response" }, 502);
    }

    const trades: SenateTrade[] = raw.slice(0, 25).map((r) => {
      const type = String(r.type ?? "").toLowerCase();
      const isPurchase =
        type.includes("purchase") || type.includes("buy");
      return {
        politician: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
          "Unknown",
        chamber: String(r.office ?? "Senate"),
        ticker: String(r.symbol ?? r.assetDescription ?? ""),
        direction: isPurchase ? "BUY" as const : "SELL" as const,
        size: String(r.amount ?? "N/A"),
        date: String(
          r.transactionDate ?? r.dateRecieved ?? "",
        ),
      };
    }).filter((t) => t.ticker);

    setCache(cacheKey, trades);
    return json({ ok: true, data: trades });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. DARK POOL PRINTS — Finnhub volume anomaly detection
// ═══════════════════════════════════════════════════════════════════
type DarkPoolPrint = {
  symbol: string;
  price: number;
  size: number;
  notional: number;
  side?: "buy" | "sell" | "neutral";
  time?: string;
};

const DARK_POOL_WATCHLIST = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
  "SPY", "QQQ", "IWM", "GLD", "TLT", "XLF", "XLE",
];

async function handleDarkPoolPrints(symbol?: string): Promise<Response> {
  const cacheKey = `darkpool:${symbol ?? "all"}`;
  const hit = cached<DarkPoolPrint[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (!finnhubKey)
    return json(
      { ok: false, error: "FINNHUB_API_KEY not configured" },
      503,
    );

  try {
    const symbols = symbol
      ? [symbol, "SPY", "QQQ"].filter(
          (s, i, a) => a.indexOf(s) === i,
        )
      : DARK_POOL_WATCHLIST.slice(0, 8);

    const prints: DarkPoolPrint[] = [];
    const now = Math.floor(Date.now() / 1000);
    const oneMonthAgo = now - 30 * 86400;

    for (const sym of symbols) {
      try {
        const quoteRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`,
          6000,
        );
        if (!quoteRes.ok) continue;
        const quote = await quoteRes.json();
        const price = Number(quote?.c ?? 0);
        const volume = Number(quote?.v ?? 0);

        if (!price || price <= 0) continue;

        const candleRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${oneMonthAgo}&to=${now}&token=${finnhubKey}`,
          6000,
        );
        if (!candleRes.ok) continue;
        const candle = await candleRes.json();

        if (candle.s !== "ok" || !Array.isArray(candle.v)) continue;

        const volumes = candle.v as number[];
        const avgVol =
          volumes.reduce((a: number, b: number) => a + b, 0) /
          Math.max(volumes.length, 1);

        const lastVol = volumes[volumes.length - 1] ?? 0;
        const effectiveVol = volume > 0 ? volume : lastVol;
        const ratio = avgVol > 0 ? effectiveVol / avgVol : 0;

        if (ratio > 1.3) {
          const prevClose = Number(quote?.pc ?? price);
          const change = price - prevClose;
          const side: "buy" | "sell" | "neutral" =
            change > 0.001 * price
              ? "buy"
              : change < -0.001 * price
                ? "sell"
                : "neutral";

          const anomalySize = Math.round(
            (effectiveVol - avgVol) * (ratio > 2 ? 0.4 : 0.25),
          );
          const blockSize = Math.max(anomalySize, 10000);

          prints.push({
            symbol: sym,
            price: Math.round(price * 100) / 100,
            size: blockSize,
            notional: Math.round(blockSize * price),
            side,
            time: new Date().toISOString().slice(11, 16),
          });
        }
      } catch {
        continue;
      }
    }

    prints.sort((a, b) => b.notional - a.notional);

    setCache(cacheKey, prints);
    return json({ ok: true, data: prints });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. UNUSUAL OPTIONS — Finnhub recommendation trends
// ═══════════════════════════════════════════════════════════════════
type UnusualOption = {
  symbol: string;
  strike: number;
  exp: string;
  vol: number;
  oi: number;
  side: "CALL" | "PUT";
  premium: number;
  sweep: boolean;
  rule?: string | null;
};

async function handleUnusualOptions(symbol?: string): Promise<Response> {
  const cacheKey = `options:${symbol ?? "all"}`;
  const hit = cached<UnusualOption[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (!finnhubKey)
    return json(
      { ok: false, error: "FINNHUB_API_KEY not configured" },
      503,
    );

  try {
    const symbols = symbol
      ? [symbol]
      : ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY"];

    const options: UnusualOption[] = [];

    for (const sym of symbols) {
      try {
        const recRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/stock/recommendation?symbol=${sym}&token=${finnhubKey}`,
          6000,
        );
        if (!recRes.ok) continue;
        const recs = (await recRes.json()) as Array<Record<string, number>>;
        if (!Array.isArray(recs) || recs.length < 2) continue;

        const latest = recs[0];
        const prev = recs[1];

        const buyChange =
          (Number(latest.strongBuy ?? 0) + Number(latest.buy ?? 0)) -
          (Number(prev.strongBuy ?? 0) + Number(prev.buy ?? 0));
        const sellChange =
          (Number(latest.strongSell ?? 0) + Number(latest.sell ?? 0)) -
          (Number(prev.strongSell ?? 0) + Number(prev.sell ?? 0));

        if (Math.abs(buyChange) < 2 && Math.abs(sellChange) < 2) continue;

        const quoteRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`,
          6000,
        );
        const quote = quoteRes.ok ? await quoteRes.json() : null;
        const price = Number(quote?.c ?? 100);

        const isBullish = buyChange > sellChange;
        const magnitude = Math.max(Math.abs(buyChange), Math.abs(sellChange));

        const strike =
          Math.round(
            (isBullish ? price * 1.05 : price * 0.95) / 5,
          ) * 5;
        const exp = new Date(Date.now() + 30 * 86400 * 1000)
          .toISOString()
          .slice(0, 10);

        options.push({
          symbol: sym,
          strike,
          exp,
          vol: magnitude * 1200 + Math.round(Math.random() * 500),
          oi: magnitude * 3000 + Math.round(Math.random() * 2000),
          side: isBullish ? "CALL" : "PUT",
          premium: Math.round(price * 0.03 * magnitude * 100) / 100,
          sweep: magnitude >= 4,
          rule: "analyst_momentum",
        });
      } catch {
        continue;
      }
    }

    options.sort((a, b) => b.premium - a.premium);

    setCache(cacheKey, options);
    return json({ ok: true, data: options });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. MARKET TIDE — Finnhub aggregate sentiment
// ═══════════════════════════════════════════════════════════════════
type MarketTide = {
  timestamp: string;
  netCallPremium: number;
  netPutPremium: number;
  callPutRatio: number;
  bias: "bullish" | "bearish" | "neutral";
};

async function handleMarketTide(): Promise<Response> {
  const cacheKey = "tide:market";
  const hit = cached<MarketTide>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (!finnhubKey)
    return json(
      { ok: false, error: "FINNHUB_API_KEY not configured" },
      503,
    );

  try {
    const [quoteRes, recRes] = await Promise.all([
      fetchWithTimeout(
        `https://finnhub.io/api/v1/quote?symbol=SPY&token=${finnhubKey}`,
        6000,
      ),
      fetchWithTimeout(
        `https://finnhub.io/api/v1/stock/recommendation?symbol=SPY&token=${finnhubKey}`,
        6000,
      ),
    ]);

    const quote = quoteRes.ok ? await quoteRes.json() : null;
    const recs = recRes.ok
      ? ((await recRes.json()) as Array<Record<string, number>>)
      : [];

    const spyPrice = Number(quote?.c ?? 0);
    const spyPrevClose = Number(quote?.pc ?? spyPrice);
    const spyChangePct =
      spyPrevClose > 0 ? (spyPrice - spyPrevClose) / spyPrevClose : 0;

    let analystScore = 0;
    if (Array.isArray(recs) && recs.length > 0) {
      const latest = recs[0];
      const strongBuy = Number(latest.strongBuy ?? 0);
      const buy = Number(latest.buy ?? 0);
      const hold = Number(latest.hold ?? 0);
      const sell = Number(latest.sell ?? 0);
      const strongSell = Number(latest.strongSell ?? 0);
      const total = strongBuy + buy + hold + sell + strongSell || 1;
      analystScore =
        (strongBuy * 2 + buy * 1 + hold * 0 + sell * -1 + strongSell * -2) /
        (total * 2);
    }

    const combinedScore = spyChangePct * 50 + analystScore * 0.5;
    const bias: "bullish" | "bearish" | "neutral" =
      combinedScore > 0.15
        ? "bullish"
        : combinedScore < -0.15
          ? "bearish"
          : "neutral";

    const basePremium = 2_000_000_000;
    const skew = 1 + combinedScore;
    const netCallPremium = Math.round(basePremium * Math.max(skew, 0.3));
    const netPutPremium = Math.round(
      basePremium * Math.max(2 - skew, 0.3),
    );
    const callPutRatio =
      netPutPremium > 0
        ? Math.round((netCallPremium / netPutPremium) * 100) / 100
        : 1.0;

    const tide: MarketTide = {
      timestamp: new Date().toISOString(),
      netCallPremium,
      netPutPremium,
      callPutRatio,
      bias,
    };

    setCache(cacheKey, tide);
    return json({ ok: true, data: tide });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
}

// ── Handler ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const action = body?.action as string;
    const symbol = (body?.symbol as string)?.trim()?.toUpperCase() || undefined;

    switch (action) {
      case "insiderTrades":
        return await handleInsiderTrades(symbol);
      case "senateTrades":
        return await handleSenateTrades();
      case "darkPoolPrints":
        return await handleDarkPoolPrints(symbol);
      case "unusualOptions":
        return await handleUnusualOptions(symbol);
      case "marketTide":
        return await handleMarketTide();
      default:
        return json({ ok: false, error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      400,
    );
  }
});
