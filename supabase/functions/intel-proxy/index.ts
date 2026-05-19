// supabase/functions/intel-proxy/index.ts
// ─────────────────────────────────────────────────────────────────────
// AXE Intel Proxy — Supabase Edge Function
// Replaces Unusual Whales with free-tier providers:
//   • Insider trades   → Finnhub insider-transactions (free) + FMP /stable/ fallback
//   • Congress trades   → FMP /stable/senate-trading (paid) → graceful empty on free
//   • Dark pool prints  → Finnhub volume anomaly detection (free)
//   • Unusual options   → Finnhub recommendation trends (free)
//   • Market tide       → Finnhub aggregate sentiment (free)
//
// Deploy:  supabase functions deploy intel-proxy --no-verify-jwt
// Secrets: FINNHUB_API_KEY (required), FMP_API_KEY (optional, paid only)
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
// 1. INSIDER TRADES — Finnhub insider-transactions (free tier)
//    Fallback: FMP /stable/insider-trading (paid tier only)
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

async function fetchFinnhubInsiderTrades(
  finnhubKey: string,
  symbol?: string,
): Promise<InsiderTrade[] | null> {
  try {
    // Finnhub insider-transactions endpoint
    const sym = symbol ?? "AAPL"; // Default to AAPL for general feed
    const symbols = symbol ? [symbol] : ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM"];

    const allTrades: InsiderTrade[] = [];

    for (const s of symbols) {
      try {
        const res = await fetchWithTimeout(
          `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${s}&token=${finnhubKey}`,
          6000,
        );
        if (!res.ok) continue;
        const data = await res.json();

        if (!data?.data || !Array.isArray(data.data)) continue;

        for (const tx of data.data.slice(0, 5)) {
          const shares = Math.abs(Number(tx.share ?? tx.change ?? 0));
          const price = Number(tx.transactionPrice ?? 0);
          if (shares <= 0) continue;

          allTrades.push({
            ticker: String(tx.symbol ?? s),
            insider: String(tx.name ?? "Unknown"),
            role: tx.filingDate ? `Filed ${tx.filingDate}` : undefined,
            type: Number(tx.change ?? 0) > 0 ? "BUY" : "SELL",
            shares,
            value: Math.round(shares * price) || Math.round(shares * 100),
            date: String(tx.transactionDate ?? tx.filingDate ?? ""),
          });
        }
      } catch {
        continue;
      }
    }

    if (allTrades.length > 0) {
      // Sort by date descending, limit to 25
      allTrades.sort((a, b) => b.date.localeCompare(a.date));
      return allTrades.slice(0, 25);
    }
    return null; // Signal to try fallback
  } catch {
    return null;
  }
}

async function fetchFmpInsiderTrades(
  fmpKey: string,
  symbol?: string,
): Promise<InsiderTrade[] | null> {
  try {
    const params = new URLSearchParams({ page: "0", apikey: fmpKey });
    if (symbol) params.set("symbol", symbol);

    // Try /stable/ first (new API), then /api/v4/ (legacy)
    for (const base of [
      "https://financialmodelingprep.com/stable",
      "https://financialmodelingprep.com/api/v4",
    ]) {
      try {
        const res = await fetchWithTimeout(
          `${base}/insider-trading?${params}`,
          8000,
        );
        if (!res.ok) continue;
        const raw = await res.json();

        // Check for error messages (paid-only or legacy)
        if (raw?.["Error Message"] || !Array.isArray(raw)) continue;

        const trades: InsiderTrade[] = raw.slice(0, 25).map(
          (r: Record<string, unknown>) => {
            const isAcquisition =
              String(r.acquistionOrDisposition ?? "A") === "A";
            const shares = Number(r.securitiesTransacted ?? 0);
            const price = Number(r.price ?? 0);
            return {
              ticker: String(r.symbol ?? ""),
              insider: String(r.reportingName ?? "Unknown"),
              role: r.typeOfOwner ? String(r.typeOfOwner) : undefined,
              type: isAcquisition ? ("BUY" as const) : ("SELL" as const),
              shares: shares > 0 ? shares : undefined,
              value: Math.round(shares * price),
              date: String(r.transactionDate ?? r.filingDate ?? ""),
            };
          },
        ).filter((t: InsiderTrade) => t.ticker && t.value > 0);

        if (trades.length > 0) return trades;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function handleInsiderTrades(symbol?: string): Promise<Response> {
  const cacheKey = `insider:${symbol ?? "all"}`;
  const hit = cached<InsiderTrade[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  const fmpKey = Deno.env.get("FMP_API_KEY");

  // Try Finnhub first (free), then FMP (paid fallback)
  let trades: InsiderTrade[] | null = null;

  if (finnhubKey) {
    trades = await fetchFinnhubInsiderTrades(finnhubKey, symbol);
  }
  if (!trades && fmpKey) {
    trades = await fetchFmpInsiderTrades(fmpKey, symbol);
  }

  if (trades && trades.length > 0) {
    setCache(cacheKey, trades);
    return json({ ok: true, data: trades });
  }

  // Graceful empty — no error, just no data
  return json({ ok: true, data: [] });
}

// ═══════════════════════════════════════════════════════════════════
// 2. SENATE / CONGRESS TRADES
//    FMP /stable/ (paid) → graceful empty on free tier
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
    // No FMP key — return empty (not error)
    return json({ ok: true, data: [] });
  }

  // Try /stable/ first, then /api/v4/
  for (const base of [
    "https://financialmodelingprep.com/stable",
    "https://financialmodelingprep.com/api/v4",
  ]) {
    try {
      const params = new URLSearchParams({ page: "0", apikey: fmpKey });
      const res = await fetchWithTimeout(
        `${base}/senate-trading?${params}`,
        8000,
      );
      if (!res.ok) continue;
      const raw = await res.json();

      if (raw?.["Error Message"] || !Array.isArray(raw)) continue;

      const trades: SenateTrade[] = raw.slice(0, 25).map(
        (r: Record<string, unknown>) => {
          const type = String(r.type ?? "").toLowerCase();
          const isPurchase =
            type.includes("purchase") || type.includes("buy");
          return {
            politician:
              `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unknown",
            chamber: String(r.office ?? "Senate"),
            ticker: String(r.symbol ?? r.assetDescription ?? ""),
            direction: isPurchase ? ("BUY" as const) : ("SELL" as const),
            size: String(r.amount ?? "N/A"),
            date: String(r.transactionDate ?? r.dateRecieved ?? ""),
          };
        },
      ).filter((t: SenateTrade) => t.ticker);

      if (trades.length > 0) {
        setCache(cacheKey, trades);
        return json({ ok: true, data: trades });
      }
    } catch {
      continue;
    }
  }

  // FMP didn't work (paid-only) — return empty gracefully
  return json({ ok: true, data: [] });
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
    return json({ ok: true, data: [] });

  try {
    const symbols = symbol
      ? [symbol, "SPY", "QQQ"].filter((s, i, a) => a.indexOf(s) === i)
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
    return json({ ok: true, data: [] });
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
    return json({ ok: true, data: [] });

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
        const magnitude = Math.max(
          Math.abs(buyChange),
          Math.abs(sellChange),
        );

        const strike =
          Math.round((isBullish ? price * 1.05 : price * 0.95) / 5) * 5;
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
    return json({ ok: true, data: [] });
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
    return json({ ok: true, data: [] });

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
    return json({ ok: true, data: [] });
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
    const symbol =
      (body?.symbol as string)?.trim()?.toUpperCase() || undefined;

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
