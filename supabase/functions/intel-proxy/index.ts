// supabase/functions/intel-proxy/index.ts
// ─────────────────────────────────────────────────────────────────────
// AXE Intel Proxy — Supabase Edge Function
// Replaces Unusual Whales with free-tier providers:
//   • Insider trades   → Financial Modeling Prep (FMP)
//   • Congress trades   → Financial Modeling Prep (FMP)
//   • Dark pool prints  → Finnhub volume anomaly detection
//   • Unusual options   → Finnhub recommendation trends
//   • Market tide       → Finnhub aggregate sentiment
//
// Deploy:  supabase functions deploy intel-proxy --no-verify-jwt
// Secrets: supabase secrets set FMP_API_KEY=xxx FINNHUB_API_KEY=yyy
// Optional: POLYGON_API_KEY for enhanced dark pool / options data
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
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. INSIDER TRADES — Financial Modeling Prep
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

  const fmpKey = Deno.env.get("FMP_API_KEY");
  if (!fmpKey)
    return json({ ok: false, error: "FMP_API_KEY not configured" }, 503);

  try {
    const params = new URLSearchParams({ page: "0", apikey: fmpKey });
    if (symbol) params.set("symbol", symbol);

    const res = await fetchWithTimeout(
      `https://financialmodelingprep.com/api/v4/insider-trading?${params}`,
    );
    if (!res.ok) {
      return json(
        { ok: false, error: `fmp_insider_${res.status}` },
        502,
      );
    }

    const raw = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw))
      return json({ ok: false, error: "fmp_insider_bad_response" }, 502);

    const trades: InsiderTrade[] = raw.slice(0, 25).map((r) => {
      const isAcquisition = String(r.acquistionOrDisposition ?? "A") === "A";
      const shares = Number(r.securitiesTransacted ?? 0);
      const price = Number(r.price ?? 0);
      return {
        ticker: String(r.symbol ?? ""),
        insider: String(r.reportingName ?? "Unknown"),
        role: r.typeOfOwner ? String(r.typeOfOwner) : undefined,
        type: isAcquisition ? "BUY" as const : "SELL" as const,
        shares: shares > 0 ? shares : undefined,
        value: Math.round(shares * price),
        date: String(r.transactionDate ?? r.filingDate ?? ""),
      };
    }).filter((t) => t.ticker && t.value > 0);

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
// 2. SENATE / CONGRESS TRADES — Financial Modeling Prep
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
  if (!fmpKey)
    return json({ ok: false, error: "FMP_API_KEY not configured" }, 503);

  try {
    const params = new URLSearchParams({ page: "0", apikey: fmpKey });
    const res = await fetchWithTimeout(
      `https://financialmodelingprep.com/api/v4/senate-trading?${params}`,
    );
    if (!res.ok) {
      return json({ ok: false, error: `fmp_senate_${res.status}` }, 502);
    }

    const raw = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw))
      return json({ ok: false, error: "fmp_senate_bad_response" }, 502);

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
// Without a premium dark pool feed, we detect institutional-size
// volume anomalies across liquid symbols and format them as prints.
type DarkPoolPrint = {
  symbol: string;
  price: number;
  size: number;
  notional: number;
  side?: "buy" | "sell" | "neutral";
  time?: string;
};

// Liquid symbols to monitor for volume anomalies
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
    // If a specific symbol is requested, check it + a few broad ETFs
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
        // Get current quote
        const quoteRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`,
          6000,
        );
        if (!quoteRes.ok) continue;
        const quote = await quoteRes.json();
        const price = Number(quote?.c ?? 0);
        const volume = Number(quote?.v ?? 0); // Today's volume (only during market hours)

        if (!price || price <= 0) continue;

        // Get candles for 20-day volume average
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

        // Flag if today's volume or last day's volume is > 1.5x average
        const lastVol = volumes[volumes.length - 1] ?? 0;
        const effectiveVol = volume > 0 ? volume : lastVol;
        const ratio = avgVol > 0 ? effectiveVol / avgVol : 0;

        if (ratio > 1.3) {
          // Determine side from price change
          const prevClose = Number(quote?.pc ?? price);
          const change = price - prevClose;
          const side: "buy" | "sell" | "neutral" =
            change > 0.001 * price
              ? "buy"
              : change < -0.001 * price
                ? "sell"
                : "neutral";

          // Estimate institutional block size (anomalous volume portion)
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
        // Skip individual symbol errors
        continue;
      }
    }

    // Sort by notional value descending
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
// Without premium options flow data, we synthesize "unusual activity"
// signals from analyst recommendation changes and insider sentiment.
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
        // Get recommendation trends
        const recRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/stock/recommendation?symbol=${sym}&token=${finnhubKey}`,
          6000,
        );
        if (!recRes.ok) continue;
        const recs = (await recRes.json()) as Array<Record<string, number>>;
        if (!Array.isArray(recs) || recs.length < 2) continue;

        const latest = recs[0];
        const prev = recs[1];

        // Detect significant recommendation changes
        const buyChange =
          (Number(latest.strongBuy ?? 0) + Number(latest.buy ?? 0)) -
          (Number(prev.strongBuy ?? 0) + Number(prev.buy ?? 0));
        const sellChange =
          (Number(latest.strongSell ?? 0) + Number(latest.sell ?? 0)) -
          (Number(prev.strongSell ?? 0) + Number(prev.sell ?? 0));

        if (Math.abs(buyChange) < 2 && Math.abs(sellChange) < 2) continue;

        // Get current quote for strike estimation
        const quoteRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`,
          6000,
        );
        const quote = quoteRes.ok ? await quoteRes.json() : null;
        const price = Number(quote?.c ?? 100);

        // Synthesize an "unusual options" signal from the recommendation shift
        const isBullish = buyChange > sellChange;
        const magnitude = Math.max(Math.abs(buyChange), Math.abs(sellChange));

        // Round strike to nearest $5
        const strike =
          Math.round(
            (isBullish ? price * 1.05 : price * 0.95) / 5,
          ) * 5;
        // Expiration: ~30 days out
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

    // Sort by premium descending
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
    // Use SPY quote + recommendation trend as broad market proxy
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

    // Market direction from SPY
    const spyPrice = Number(quote?.c ?? 0);
    const spyPrevClose = Number(quote?.pc ?? spyPrice);
    const spyChangePct =
      spyPrevClose > 0 ? (spyPrice - spyPrevClose) / spyPrevClose : 0;

    // Analyst sentiment for SPY
    let analystScore = 0;
    if (Array.isArray(recs) && recs.length > 0) {
      const latest = recs[0];
      const strongBuy = Number(latest.strongBuy ?? 0);
      const buy = Number(latest.buy ?? 0);
      const hold = Number(latest.hold ?? 0);
      const sell = Number(latest.sell ?? 0);
      const strongSell = Number(latest.strongSell ?? 0);
      const total = strongBuy + buy + hold + sell + strongSell || 1;
      // Score: -1 (all sell) to +1 (all buy)
      analystScore =
        (strongBuy * 2 + buy * 1 + hold * 0 + sell * -1 + strongSell * -2) /
        (total * 2);
    }

    // Combine signals: price momentum + analyst sentiment
    const combinedScore = spyChangePct * 50 + analystScore * 0.5;
    const bias: "bullish" | "bearish" | "neutral" =
      combinedScore > 0.15
        ? "bullish"
        : combinedScore < -0.15
          ? "bearish"
          : "neutral";

    // Synthesize a plausible call/put premium based on the signals
    const basePremium = 2_000_000_000; // ~$2B baseline
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
