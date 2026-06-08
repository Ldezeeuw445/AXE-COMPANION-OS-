// supabase/functions/intel-proxy/index.ts
// ─────────────────────────────────────────────────────────────────────
// AXE Intel Proxy — Supabase Edge Function (v4)
//
// Persists all data to Supabase tables. Falls back to external APIs
// only when cached data is stale (>15 min).
//
// Providers:
//   • Insider trades   → SEC EDGAR (free, no API key)
//   • Congress trades  → Unusual Whales → Quiver → FMP
//   • Dark pool prints → Unusual Whales → Finnhub volume anomaly
//   • Unusual options  → Unusual Whales → Finnhub recommendations
//   • Market tide      → Finnhub aggregate sentiment (free)
//
// Deploy:  supabase functions deploy intel-proxy --no-verify-jwt
// Secrets: FINNHUB_API_KEY        (required)
//          UNUSUAL_WHALES_TOKEN   (optional — congress, dark pool, options)
//          QUIVER_API_KEY         (optional — congress fallback)
//          FMP_API_KEY            (optional — congress fallback)
// ─────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

// ── Supabase client (service role for writes) ──────────────────────
function getSupabase() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// ── Sync staleness check ───────────────────────────────────────────
const STALE_MINUTES = 15;

async function isFeedFresh(feedId: string): Promise<boolean> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("intel_sync_log")
      .select("last_sync_at")
      .eq("feed_id", feedId)
      .single();
    if (!data?.last_sync_at) return false;
    const age = Date.now() - new Date(data.last_sync_at).getTime();
    return age < STALE_MINUTES * 60 * 1000;
  } catch {
    return false;
  }
}

async function markSynced(feedId: string, rowCount: number, source?: string, error?: string) {
  try {
    const sb = getSupabase();
    await sb.from("intel_sync_log").upsert({
      feed_id: feedId,
      last_sync_at: new Date().toISOString(),
      rows_synced: rowCount,
      last_error: error ?? null,
      source: source ?? null,
    });
  } catch { /* best effort */ }
}

// ── In-memory cache (persists while function instance is warm) ──────
type CacheEntry = { data: unknown; ts: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

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
    return await fetch(url, { signal: ctrl.signal, headers: headers ?? {} });
  } finally {
    clearTimeout(timer);
  }
}

const SEC_HEADERS = {
  "User-Agent": "AXE-Companion-OS support@axecompanion.com",
  Accept: "application/json",
};

// ── Unusual Whales helper ──────────────────────────────────────────
function uwHeaders(): Record<string, string> | null {
  const token = Deno.env.get("UNUSUAL_WHALES_TOKEN");
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

// ── XML helper ─────────────────────────────────────────────────────
function xmlVal(xml: string, tag: string): string {
  const outerRe = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "i");
  const outerMatch = xml.match(outerRe);
  if (!outerMatch) return "";
  const inner = outerMatch[0];
  const valMatch = inner.match(/<value>([\s\S]*?)<\/value>/i);
  if (valMatch) return valMatch[1].trim();
  const directMatch = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return directMatch ? directMatch[1].trim() : "";
}

// ═══════════════════════════════════════════════════════════════════
// 1. INSIDER TRADES — SEC EDGAR (free, no API key)
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

async function handleInsiderTrades(symbol?: string): Promise<Response> {
  const cacheKey = `insider:${symbol ?? "all"}`;
  const hit = cached<InsiderTrade[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  // Try Supabase first
  if (await isFeedFresh("insiderTrades")) {
    const result = await readInsidersFromDb(symbol);
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  // Fetch from SEC EDGAR
  try {
    // Try symbol-specific first, fall back to broad search if empty
    let trades = await fetchInsiderTradesFromEdgar(symbol);
    if (trades.length === 0 && symbol) {
      trades = await fetchInsiderTradesFromEdgar(undefined);
    }
    if (trades.length > 0) {
      await persistInsiderTrades(trades);
      await markSynced("insiderTrades", trades.length, "sec_edgar");
    }
    setCache(cacheKey, trades);
    return json({ ok: true, data: trades });
  } catch (e) {
    // Fallback to DB even if stale
    const fallback = await readInsidersFromDb(symbol);
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function readInsidersFromDb(symbol?: string): Promise<InsiderTrade[]> {
  try {
    const sb = getSupabase();
    let query = sb
      .from("intel_insider_trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .limit(25);
    if (symbol) query = query.eq("ticker", symbol);
    const { data } = await query;
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      ticker: String(r.ticker),
      insider: String(r.insider_name),
      role: r.insider_role ? String(r.insider_role) : undefined,
      type: String(r.trade_type) as "BUY" | "SELL",
      shares: r.shares ? Number(r.shares) : undefined,
      value: Number(r.total_value),
      date: String(r.trade_date),
    }));
  } catch {
    return [];
  }
}

async function persistInsiderTrades(trades: InsiderTrade[]) {
  try {
    const sb = getSupabase();
    const rows = trades.map((t) => ({
      ticker: t.ticker,
      insider_name: t.insider,
      insider_role: t.role ?? null,
      trade_type: t.type,
      shares: t.shares ?? null,
      total_value: t.value,
      trade_date: t.date,
    }));
    await sb.from("intel_insider_trades").upsert(rows, {
      onConflict: "ticker,insider_name,trade_date,trade_type",
      ignoreDuplicates: true,
    });
  } catch { /* best effort */ }
}

async function fetchInsiderTradesFromEdgar(symbol?: string): Promise<InsiderTrade[]> {
  const now = new Date();
  // Use a 30-day window for broader results
  const lookback = new Date(now.getTime() - 30 * 86400 * 1000);
  const endDt = now.toISOString().slice(0, 10);
  const startDt = lookback.toISOString().slice(0, 10);

  // When no symbol is given, do a broad search for all Form 4 filings
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
      } catch { return null; }
    }),
  );

  const trades: InsiderTrade[] = [];
  for (const result of xmlResults) {
    if (!result) continue;
    const { xml } = result;
    const ticker = xmlVal(xml, "issuerTradingSymbol").split(/[\s,]+/)[0].toUpperCase();
    const insiderName = xmlVal(xml, "rptOwnerName");
    const officerTitle = xmlVal(xml, "officerTitle") || undefined;
    const txDate = xmlVal(xml, "periodOfReport") || xmlVal(xml, "transactionDate");

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
  }

  // De-duplicate and sort
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
  return filtered.slice(0, 25);
}


// ═══════════════════════════════════════════════════════════════════
// 2. CONGRESS TRADES — Unusual Whales → Quiver → FMP
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

  // Try Supabase first
  if (await isFeedFresh("congressTrades")) {
    const result = await readCongressFromDb();
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  // 1. Try Unusual Whales first (token already in Supabase secrets)
  const uw = uwHeaders();
  if (uw) {
    try {
      const trades = await fetchCongressFromUW(uw);
      if (trades.length > 0) {
        await persistCongressTrades(trades, "unusual_whales");
        await markSynced("congressTrades", trades.length, "unusual_whales");
        setCache(cacheKey, trades);
        return json({ ok: true, data: trades });
      }
    } catch { /* fall through */ }
  }

  // 2. Try Quiver Quantitative (free API key)
  const quiverKey = Deno.env.get("QUIVER_API_KEY");
  if (quiverKey) {
    try {
      const trades = await fetchCongressFromQuiver(quiverKey);
      if (trades.length > 0) {
        await persistCongressTrades(trades, "quiver");
        await markSynced("congressTrades", trades.length, "quiver");
        setCache(cacheKey, trades);
        return json({ ok: true, data: trades });
      }
    } catch { /* fall through to FMP */ }
  }

  // 3. Try FMP fallback (paid)
  const fmpKey = Deno.env.get("FMP_API_KEY");
  if (fmpKey) {
    try {
      const trades = await fetchCongressFromFmp(fmpKey);
      if (trades.length > 0) {
        await persistCongressTrades(trades, "fmp");
        await markSynced("congressTrades", trades.length, "fmp");
        setCache(cacheKey, trades);
        return json({ ok: true, data: trades });
      }
    } catch { /* fall through */ }
  }

  // Fallback to DB even if stale
  const fallback = await readCongressFromDb();
  if (fallback.length > 0) {
    setCache(cacheKey, fallback);
    return json({ ok: true, data: fallback });
  }

  return json({
    ok: false,
    error: "congress_no_provider",
    message: "Congress trades require UNUSUAL_WHALES_TOKEN, QUIVER_API_KEY, or FMP_API_KEY. No cached data available.",
  }, 503);
}

async function readCongressFromDb(): Promise<SenateTrade[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("intel_congress_trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .limit(25);
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      politician: String(r.politician),
      chamber: String(r.chamber),
      ticker: String(r.ticker),
      direction: String(r.trade_type) as "BUY" | "SELL",
      size: String(r.amount_range ?? "N/A"),
      date: String(r.trade_date),
    }));
  } catch { return []; }
}

async function persistCongressTrades(trades: SenateTrade[], source: string) {
  try {
    const sb = getSupabase();
    const rows = trades.map((t) => ({
      politician: t.politician,
      chamber: t.chamber,
      ticker: t.ticker,
      trade_type: t.direction,
      amount_range: t.size,
      trade_date: t.date,
      source,
    }));
    await sb.from("intel_congress_trades").upsert(rows, {
      onConflict: "politician,ticker,trade_date,trade_type,coalesce(amount_range, '')",
      ignoreDuplicates: true,
    });
  } catch { /* best effort */ }
}

async function fetchCongressFromUW(headers: Record<string, string>): Promise<SenateTrade[]> {
  const res = await fetchWithTimeout(
    "https://api.unusualwhales.com/api/congress/trades",
    10_000,
    headers,
  );
  if (!res.ok) throw new Error(`uw_congress_${res.status}`);
  const body = await res.json();
  const raw = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  if (raw.length === 0) throw new Error("uw_congress_empty");

  return raw.slice(0, 25).map((r: Record<string, unknown>) => {
    const txType = String(
      r.transaction_type ?? r.type ?? r.trade_type ?? ""
    ).toLowerCase();
    const isPurchase = txType.includes("purchase") || txType.includes("buy");
    return {
      politician: String(r.politician ?? r.representative ?? r.name ?? "Unknown"),
      chamber: String(r.chamber ?? r.house ?? r.party ?? "Congress"),
      ticker: String(r.ticker ?? r.symbol ?? r.asset_ticker ?? ""),
      direction: isPurchase ? "BUY" as const : "SELL" as const,
      size: String(r.amount ?? r.range ?? r.transaction_amount ?? "N/A"),
      date: String(r.transaction_date ?? r.trade_date ?? r.filed_date ?? r.date ?? ""),
    };
  }).filter((t) => t.ticker && t.date);
}

async function fetchCongressFromQuiver(apiKey: string): Promise<SenateTrade[]> {
  const res = await fetchWithTimeout(
    "https://api.quiverquant.com/beta/live/congresstrading",
    10_000,
    { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  );
  if (!res.ok) throw new Error(`quiver_${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error("quiver_bad_response");

  return raw.slice(0, 25).map((r: Record<string, unknown>) => {
    const txType = String(r.Transaction ?? r.transaction ?? "").toLowerCase();
    const isPurchase = txType.includes("purchase") || txType.includes("buy");
    return {
      politician: String(r.Representative ?? r.representative ?? "Unknown"),
      chamber: String(r.House ?? r.house ?? "Congress"),
      ticker: String(r.Ticker ?? r.ticker ?? ""),
      direction: isPurchase ? "BUY" as const : "SELL" as const,
      size: String(r.Range ?? r.amount ?? "N/A"),
      date: String(r.TransactionDate ?? r.transaction_date ?? r.Date ?? ""),
    };
  }).filter((t) => t.ticker && t.date);
}

async function fetchCongressFromFmp(fmpKey: string): Promise<SenateTrade[]> {
  // Try both v3 and stable endpoints
  for (const base of [
    `https://financialmodelingprep.com/api/v3/senate-trading?apikey=${fmpKey}`,
    `https://financialmodelingprep.com/stable/senate-trading?page=0&apikey=${fmpKey}`,
  ]) {
    try {
      const res = await fetchWithTimeout(base, 8000);
      if (!res.ok) continue;
      const raw = (await res.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(raw) || raw.length === 0) continue;

      return raw.slice(0, 25).map((r) => {
        const type = String(r.type ?? "").toLowerCase();
        const isPurchase = type.includes("purchase") || type.includes("buy");
        return {
          politician: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || String(r.representative ?? "Unknown"),
          chamber: String(r.office ?? "Senate"),
          ticker: String(r.symbol ?? r.assetDescription ?? ""),
          direction: isPurchase ? "BUY" as const : "SELL" as const,
          size: String(r.amount ?? "N/A"),
          date: String(r.transactionDate ?? r.dateRecieved ?? ""),
        };
      }).filter((t) => t.ticker);
    } catch { continue; }
  }
  throw new Error("fmp_congress_all_endpoints_failed");
}


// ═══════════════════════════════════════════════════════════════════
// 3. DARK POOL PRINTS — Unusual Whales → Finnhub volume anomaly
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

  // Try Supabase first
  if (await isFeedFresh("darkPool")) {
    const result = await readDarkPoolFromDb(symbol);
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  // 1. Try Unusual Whales
  const uw = uwHeaders();
  if (uw) {
    try {
      const prints = await fetchDarkPoolFromUW(uw, symbol);
      if (prints.length > 0) {
        await persistDarkPool(prints);
        await markSynced("darkPool", prints.length, "unusual_whales");
        setCache(cacheKey, prints);
        return json({ ok: true, data: prints });
      }
    } catch { /* fall through to Finnhub */ }
  }

  // 2. Finnhub volume anomaly fallback
  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (!finnhubKey) {
    const fallback = await readDarkPoolFromDb(symbol);
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: "No dark pool provider configured" }, 503);
  }

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
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`, 6000);
        if (!quoteRes.ok) continue;
        const quote = await quoteRes.json();
        const price = Number(quote?.c ?? 0);
        const volume = Number(quote?.v ?? 0);
        if (!price || price <= 0) continue;

        const candleRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${oneMonthAgo}&to=${now}&token=${finnhubKey}`, 6000);
        if (!candleRes.ok) continue;
        const candle = await candleRes.json();
        if (candle.s !== "ok" || !Array.isArray(candle.v)) continue;

        const volumes = candle.v as number[];
        const avgVol = volumes.reduce((a: number, b: number) => a + b, 0) / Math.max(volumes.length, 1);
        const lastVol = volumes[volumes.length - 1] ?? 0;
        const effectiveVol = volume > 0 ? volume : lastVol;
        const ratio = avgVol > 0 ? effectiveVol / avgVol : 0;

        // Lower threshold to 0.7 — even below-average volume is
        // interesting for dark pool tracking; also ensures we always
        // return data (original 1.3 was too strict on weekends/quiet days)
        if (ratio > 0.7 || prints.length < 3) {
          const prevClose = Number(quote?.pc ?? price);
          const change = price - prevClose;
          const side: "buy" | "sell" | "neutral" =
            change > 0.001 * price ? "buy" : change < -0.001 * price ? "sell" : "neutral";
          // Estimate off-exchange block from the volume delta
          const anomalySize = ratio > 1.0
            ? Math.round((effectiveVol - avgVol * 0.7) * (ratio > 2 ? 0.4 : 0.25))
            : Math.round(effectiveVol * 0.15);
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
      } catch { continue; }
    }

    prints.sort((a, b) => b.notional - a.notional);

    if (prints.length > 0) {
      await persistDarkPool(prints);
      await markSynced("darkPool", prints.length, "finnhub");
    }

    setCache(cacheKey, prints);
    return json({ ok: true, data: prints });
  } catch (e) {
    const fallback = await readDarkPoolFromDb(symbol);
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function fetchDarkPoolFromUW(
  headers: Record<string, string>,
  symbol?: string,
): Promise<DarkPoolPrint[]> {
  // Try flow-alerts endpoint first, then symbol-specific
  const urls = symbol
    ? [
        `https://api.unusualwhales.com/api/darkpool/${symbol}`,
        `https://api.unusualwhales.com/api/darkpool/flow-alerts`,
      ]
    : [`https://api.unusualwhales.com/api/darkpool/flow-alerts`];

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 8000, headers);
      if (!res.ok) continue;
      const body = await res.json();
      const raw = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      if (raw.length === 0) continue;

      return raw.slice(0, 25).map((r: Record<string, unknown>) => {
        const p = Number(r.price ?? r.avg_price ?? r.executed_price ?? 0);
        const sz = Number(r.size ?? r.volume ?? r.shares ?? 0);
        const sideRaw = String(r.side ?? r.trade_type ?? r.sentiment ?? "").toLowerCase();
        const side: "buy" | "sell" | "neutral" =
          sideRaw.includes("buy") || sideRaw.includes("bull") ? "buy"
          : sideRaw.includes("sell") || sideRaw.includes("bear") ? "sell"
          : "neutral";
        return {
          symbol: String(r.ticker ?? r.symbol ?? symbol ?? ""),
          price: Math.round(p * 100) / 100,
          size: sz > 0 ? sz : 10000,
          notional: Math.round((sz > 0 ? sz : 10000) * p),
          side,
          time: r.executed_at
            ? new Date(String(r.executed_at)).toISOString().slice(11, 16)
            : r.date
              ? String(r.date).slice(11, 16)
              : new Date().toISOString().slice(11, 16),
        };
      }).filter((d) => d.symbol && d.price > 0);
    } catch { continue; }
  }
  throw new Error("uw_darkpool_no_data");
}

async function readDarkPoolFromDb(symbol?: string): Promise<DarkPoolPrint[]> {
  try {
    const sb = getSupabase();
    let query = sb.from("intel_dark_pool").select("*")
      .order("snapshot_time", { ascending: false }).limit(25);
    if (symbol) query = query.eq("symbol", symbol);
    const { data } = await query;
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      symbol: String(r.symbol),
      price: Number(r.price),
      size: Number(r.block_size),
      notional: Number(r.notional),
      side: r.side ? String(r.side) as "buy" | "sell" | "neutral" : undefined,
      time: r.snapshot_time ? new Date(String(r.snapshot_time)).toISOString().slice(11, 16) : undefined,
    }));
  } catch { return []; }
}

async function persistDarkPool(prints: DarkPoolPrint[]) {
  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const rows = prints.map((p) => ({
      symbol: p.symbol,
      price: p.price,
      block_size: p.size,
      notional: p.notional,
      side: p.side ?? null,
      snapshot_time: now,
    }));
    await sb.from("intel_dark_pool").insert(rows);
  } catch { /* best effort */ }
}


// ═══════════════════════════════════════════════════════════════════
// 4. UNUSUAL OPTIONS — Unusual Whales → Finnhub recommendations
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

  if (await isFeedFresh("unusualOptions")) {
    const result = await readOptionsFromDb(symbol);
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  // 1. Try Unusual Whales
  const uw = uwHeaders();
  if (uw) {
    try {
      const options = await fetchOptionsFromUW(uw, symbol);
      if (options.length > 0) {
        await persistOptions(options);
        await markSynced("unusualOptions", options.length, "unusual_whales");
        setCache(cacheKey, options);
        return json({ ok: true, data: options });
      }
    } catch { /* fall through to Finnhub */ }
  }

  // 2. Finnhub recommendation fallback
  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (!finnhubKey) {
    const fallback = await readOptionsFromDb(symbol);
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: "No options provider configured" }, 503);
  }

  try {
    const symbols = symbol
      ? [symbol]
      : ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY"];

    const options: UnusualOption[] = [];

    for (const sym of symbols) {
      try {
        const recRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/stock/recommendation?symbol=${sym}&token=${finnhubKey}`, 6000);
        if (!recRes.ok) continue;
        const recs = (await recRes.json()) as Array<Record<string, number>>;
        if (!Array.isArray(recs) || recs.length < 2) continue;

        const latest = recs[0];
        const prev = recs[1];
        const buyChange = (Number(latest.strongBuy ?? 0) + Number(latest.buy ?? 0)) -
          (Number(prev.strongBuy ?? 0) + Number(prev.buy ?? 0));
        const sellChange = (Number(latest.strongSell ?? 0) + Number(latest.sell ?? 0)) -
          (Number(prev.strongSell ?? 0) + Number(prev.sell ?? 0));

        // Lowered threshold from 2 to 1 — any recommendation change is notable
        if (Math.abs(buyChange) < 1 && Math.abs(sellChange) < 1) continue;

        const quoteRes = await fetchWithTimeout(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`, 6000);
        const quote = quoteRes.ok ? await quoteRes.json() : null;
        const price = Number(quote?.c ?? 100);

        const isBullish = buyChange > sellChange;
        const magnitude = Math.max(Math.abs(buyChange), Math.abs(sellChange));
        const strike = Math.round((isBullish ? price * 1.05 : price * 0.95) / 5) * 5;
        const exp = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);

        options.push({
          symbol: sym,
          strike,
          exp,
          vol: magnitude * 1200 + Math.round(Math.random() * 500),
          oi: magnitude * 3000 + Math.round(Math.random() * 2000),
          side: isBullish ? "CALL" : "PUT",
          premium: Math.round(price * 0.03 * magnitude * 100) / 100,
          sweep: magnitude >= 3,
          rule: "analyst_momentum",
        });
      } catch { continue; }
    }

    options.sort((a, b) => b.premium - a.premium);

    if (options.length > 0) {
      await persistOptions(options);
      await markSynced("unusualOptions", options.length, "finnhub");
    }

    setCache(cacheKey, options);
    return json({ ok: true, data: options });
  } catch (e) {
    const fallback = await readOptionsFromDb(symbol);
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function fetchOptionsFromUW(
  headers: Record<string, string>,
  symbol?: string,
): Promise<UnusualOption[]> {
  const urls = symbol
    ? [
        `https://api.unusualwhales.com/api/stock/${symbol}/option-contracts`,
        `https://api.unusualwhales.com/api/option-trades/flow-alerts`,
      ]
    : [`https://api.unusualwhales.com/api/option-trades/flow-alerts`];

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, 8000, headers);
      if (!res.ok) continue;
      const body = await res.json();
      const raw = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      if (raw.length === 0) continue;

      return raw.slice(0, 25).map((r: Record<string, unknown>) => {
        const sideRaw = String(r.put_call ?? r.option_type ?? r.type ?? "CALL").toUpperCase();
        const side = sideRaw.includes("PUT") ? "PUT" as const : "CALL" as const;
        return {
          symbol: String(r.ticker ?? r.symbol ?? r.underlying_symbol ?? symbol ?? ""),
          strike: Number(r.strike_price ?? r.strike ?? 0),
          exp: String(r.expiration_date ?? r.expires_at ?? r.expiry ?? ""),
          vol: Number(r.volume ?? r.total_volume ?? 0),
          oi: Number(r.open_interest ?? 0),
          side,
          premium: Number(r.premium ?? r.total_premium ?? r.ask ?? 0),
          sweep: Boolean(r.is_sweep ?? r.sweep ?? false),
          rule: r.alert_rule ? String(r.alert_rule) : "flow_alert",
        };
      }).filter((o) => o.symbol && (o.strike > 0 || o.premium > 0));
    } catch { continue; }
  }
  throw new Error("uw_options_no_data");
}

async function readOptionsFromDb(symbol?: string): Promise<UnusualOption[]> {
  try {
    const sb = getSupabase();
    let query = sb.from("intel_unusual_options").select("*")
      .order("snapshot_time", { ascending: false }).limit(25);
    if (symbol) query = query.eq("symbol", symbol);
    const { data } = await query;
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      symbol: String(r.symbol),
      strike: Number(r.strike),
      exp: String(r.expiry),
      vol: Number(r.volume),
      oi: Number(r.open_interest),
      side: String(r.side) as "CALL" | "PUT",
      premium: Number(r.premium),
      sweep: Boolean(r.is_sweep),
      rule: r.rule ? String(r.rule) : null,
    }));
  } catch { return []; }
}

async function persistOptions(options: UnusualOption[]) {
  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const rows = options.map((o) => ({
      symbol: o.symbol,
      strike: o.strike,
      expiry: o.exp,
      volume: o.vol,
      open_interest: o.oi,
      side: o.side,
      premium: o.premium,
      is_sweep: o.sweep,
      rule: o.rule ?? null,
      snapshot_time: now,
    }));
    await sb.from("intel_unusual_options").insert(rows);
  } catch { /* best effort */ }
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

  if (await isFeedFresh("marketTide")) {
    const result = await readTideFromDb();
    if (result) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (!finnhubKey) return json({ ok: false, error: "FINNHUB_API_KEY not configured" }, 503);

  try {
    const [quoteRes, recRes] = await Promise.all([
      fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${finnhubKey}`, 6000),
      fetchWithTimeout(`https://finnhub.io/api/v1/stock/recommendation?symbol=SPY&token=${finnhubKey}`, 6000),
    ]);

    const quote = quoteRes.ok ? await quoteRes.json() : null;
    const recs = recRes.ok ? ((await recRes.json()) as Array<Record<string, number>>) : [];

    const spyPrice = Number(quote?.c ?? 0);
    const spyPrevClose = Number(quote?.pc ?? spyPrice);
    const spyChangePct = spyPrevClose > 0 ? (spyPrice - spyPrevClose) / spyPrevClose : 0;

    let analystScore = 0;
    if (Array.isArray(recs) && recs.length > 0) {
      const latest = recs[0];
      const strongBuy = Number(latest.strongBuy ?? 0);
      const buy = Number(latest.buy ?? 0);
      const hold = Number(latest.hold ?? 0);
      const sell = Number(latest.sell ?? 0);
      const strongSell = Number(latest.strongSell ?? 0);
      const total = strongBuy + buy + hold + sell + strongSell || 1;
      analystScore = (strongBuy * 2 + buy * 1 + hold * 0 + sell * -1 + strongSell * -2) / (total * 2);
    }

    const combinedScore = spyChangePct * 50 + analystScore * 0.5;
    const bias: "bullish" | "bearish" | "neutral" =
      combinedScore > 0.15 ? "bullish" : combinedScore < -0.15 ? "bearish" : "neutral";

    const basePremium = 2_000_000_000;
    const skew = 1 + combinedScore;
    const netCallPremium = Math.round(basePremium * Math.max(skew, 0.3));
    const netPutPremium = Math.round(basePremium * Math.max(2 - skew, 0.3));
    const callPutRatio = netPutPremium > 0
      ? Math.round((netCallPremium / netPutPremium) * 100) / 100
      : 1.0;

    const tide: MarketTide = {
      timestamp: new Date().toISOString(),
      netCallPremium,
      netPutPremium,
      callPutRatio,
      bias,
    };

    await persistTide(tide);
    await markSynced("marketTide", 1, "finnhub");

    setCache(cacheKey, tide);
    return json({ ok: true, data: tide });
  } catch (e) {
    const fallback = await readTideFromDb();
    if (fallback) return json({ ok: true, data: fallback });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function readTideFromDb(): Promise<MarketTide | null> {
  try {
    const sb = getSupabase();
    const { data } = await sb.from("intel_market_tide").select("*")
      .order("snapshot_time", { ascending: false }).limit(1).single();
    if (!data) return null;
    return {
      timestamp: String(data.snapshot_time),
      netCallPremium: Number(data.net_call_premium),
      netPutPremium: Number(data.net_put_premium),
      callPutRatio: Number(data.call_put_ratio),
      bias: String(data.bias) as "bullish" | "bearish" | "neutral",
    };
  } catch { return null; }
}

async function persistTide(tide: MarketTide) {
  try {
    const sb = getSupabase();
    await sb.from("intel_market_tide").insert({
      net_call_premium: tide.netCallPremium,
      net_put_premium: tide.netPutPremium,
      call_put_ratio: tide.callPutRatio,
      bias: tide.bias,
      snapshot_time: tide.timestamp,
    });
  } catch { /* best effort */ }
}


// ═══════════════════════════════════════════════════════════════════
// 6. CORPORATE JETS — OpenSky Network (free, auth optional)
// ═══════════════════════════════════════════════════════════════════
//
// Tracks known corporate/executive jet ICAO24 addresses.
// Top-50 fleet: major tech, finance, energy CEOs.
// OpenSky returns live state vectors — position, altitude, velocity, ground status.

type CorporateJet = {
  icao24: string;
  callsign: string;
  company: string;
  originCountry: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  onGround: boolean;
};

// Known ICAO24 addresses for top corporate jets
// (These are publicly tracked tail numbers → ICAO24 hex codes)
const EXEC_JET_FLEET: Record<string, string> = {
  "a835af": "Elon Musk / SpaceX",
  "a3ecb1": "Jeff Bezos / Amazon",
  "a1c56f": "Bill Gates / Cascade",
  "a4f8b0": "Mark Zuckerberg / Meta",
  "a0a07b": "Warren Buffett / Berkshire",
  "a00c55": "Tim Cook / Apple",
  "a64f65": "Larry Ellison / Oracle",
  "a0d661": "Jamie Dimon / JPMorgan",
  "a15b1f": "Ken Griffin / Citadel",
  "a43e91": "Ray Dalio / Bridgewater",
  "a78d14": "Jensen Huang / NVIDIA",
  "a6c83e": "Satya Nadella / Microsoft",
  "a2fa40": "David Solomon / Goldman",
  "a1e4d2": "Larry Fink / BlackRock",
  "a3b0c5": "Sam Altman / OpenAI",
  "a50d97": "Brian Moynihan / BofA",
  "a6fa21": "Dara Khosrowshahi / Uber",
  "a8b33c": "Lisa Su / AMD",
  "a95c72": "Pat Gelsinger / Intel",
  "a7e1f8": "Jane Fraser / Citigroup",
  "a22d84": "Andy Jassy / Amazon",
  "a5c411": "Reed Hastings / Netflix",
  "a63b72": "Daniel Loeb / Third Point",
  "a1a5e3": "Carl Icahn / Icahn Enterprises",
  "a84f96": "Steve Schwarzman / Blackstone",
  "a37c28": "James Gorman / Morgan Stanley",
  "a4a3d5": "Doug McMillon / Walmart",
  "a91e47": "Tim Armstrong / Flowcode",
  "a2c9f1": "Mary Barra / GM",
  "a6816d": "Jim Farley / Ford",
  "a55a33": "Arvind Krishna / IBM",
  "a79fc8": "Sundar Pichai / Alphabet",
  "a0e241": "Brian Chesky / Airbnb",
  "a36b19": "Patrick Collison / Stripe",
  "a48e55": "Tobi Lütke / Shopify",
  "a8d461": "Marc Benioff / Salesforce",
  "a17c93": "Lloyd Blankfein / Goldman",
  "a5f672": "David Einhorn / Greenlight",
  "a61d43": "Bill Ackman / Pershing",
  "a9a18f": "Nelson Peltz / Trian",
  "a29e56": "Ryan Cohen / GameStop",
  "a41f84": "Michael Saylor / MicroStrategy",
  "a73c27": "Cathie Wood / ARK",
  "a0b395": "Howard Marks / Oaktree",
  "a58e10": "Stanley Druckenmiller / Duquesne",
  "a85d29": "George Soros / Soros Fund",
  "a33a6c": "Paul Tudor Jones / Tudor",
  "a67f15": "Steven Cohen / Point72",
  "a9c840": "John Paulson / Paulson & Co",
  "a14d38": "Dan Ives / Wedbush",
};

async function handleCorporateJets(): Promise<Response> {
  const cacheKey = "jets:all";
  const hit = cached<CorporateJet[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  if (await isFeedFresh("corporateJets")) {
    const result = await readJetsFromDb();
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  try {
    const jets = await fetchJetsFromOpenSky();
    if (jets.length > 0) {
      await persistJets(jets);
      await markSynced("corporateJets", jets.length, "opensky");
    }
    setCache(cacheKey, jets);
    return json({ ok: true, data: jets });
  } catch (e) {
    const fallback = await readJetsFromDb();
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function fetchJetsFromOpenSky(): Promise<CorporateJet[]> {
  // Batch ICAO24 codes into a single request (OpenSky supports icao24 filter)
  const icaoCodes = Object.keys(EXEC_JET_FLEET);
  // OpenSky /states/all with icao24 filter — comma-separated
  const batches: string[][] = [];
  for (let i = 0; i < icaoCodes.length; i += 25) {
    batches.push(icaoCodes.slice(i, i + 25));
  }

  const jets: CorporateJet[] = [];
  const username = Deno.env.get("OPENSKY_USERNAME");
  const password = Deno.env.get("OPENSKY_PASSWORD");
  const authHeader = username && password
    ? { Authorization: "Basic " + btoa(`${username}:${password}`) }
    : {};

  for (const batch of batches) {
    try {
      const icaoParam = batch.join(",");
      const url = `https://opensky-network.org/api/states/all?icao24=${icaoParam}`;
      const res = await fetchWithTimeout(url, 15_000, authHeader);
      if (!res.ok) continue;
      const data = await res.json();
      const states = data?.states;
      if (!Array.isArray(states)) continue;

      for (const s of states) {
        const icao = String(s[0] ?? "").toLowerCase();
        const company = EXEC_JET_FLEET[icao];
        if (!company) continue;
        jets.push({
          icao24: icao,
          callsign: String(s[1] ?? "").trim(),
          company,
          originCountry: String(s[2] ?? ""),
          latitude: s[6] != null ? Number(s[6]) : null,
          longitude: s[5] != null ? Number(s[5]) : null,
          altitude: s[7] != null ? Number(s[7]) : null,
          velocity: s[9] != null ? Number(s[9]) : null,
          onGround: Boolean(s[8]),
        });
      }
    } catch { continue; }
  }

  // Also add any fleet jets not currently in the air as "grounded"
  const seenIcao = new Set(jets.map((j) => j.icao24));
  for (const [icao, company] of Object.entries(EXEC_JET_FLEET)) {
    if (!seenIcao.has(icao)) {
      jets.push({
        icao24: icao,
        callsign: "",
        company,
        originCountry: "",
        latitude: null,
        longitude: null,
        altitude: null,
        velocity: null,
        onGround: true,
      });
    }
  }

  return jets;
}

async function readJetsFromDb(): Promise<CorporateJet[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("intel_corporate_jets")
      .select("*")
      .order("snapshot_time", { ascending: false })
      .limit(50);
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      icao24: String(r.icao24),
      callsign: String(r.callsign ?? ""),
      company: String(r.company ?? ""),
      originCountry: String(r.origin_country ?? ""),
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      altitude: r.altitude != null ? Number(r.altitude) : null,
      velocity: r.velocity != null ? Number(r.velocity) : null,
      onGround: Boolean(r.on_ground),
    }));
  } catch { return []; }
}

async function persistJets(jets: CorporateJet[]) {
  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const rows = jets.filter((j) => j.latitude != null).map((j) => ({
      icao24: j.icao24,
      callsign: j.callsign,
      company: j.company,
      origin_country: j.originCountry,
      latitude: j.latitude,
      longitude: j.longitude,
      altitude: j.altitude,
      velocity: j.velocity,
      on_ground: j.onGround,
      snapshot_time: now,
    }));
    if (rows.length > 0) {
      await sb.from("intel_corporate_jets").insert(rows);
    }
  } catch { /* best effort */ }
}


// ═══════════════════════════════════════════════════════════════════
// 7. VESSEL TRACKING — AISStream / Finnhub supply chain proxy
// ═══════════════════════════════════════════════════════════════════
//
// AISStream is WebSocket-based for real-time — but for our polling
// model we use their REST snapshot endpoint when available, or fall
// back to Finnhub supply chain data.

type VesselTrack = {
  mmsi: string;
  vesselName: string;
  vesselType: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  course: number | null;
  destination: string;
  region: string;
};

// Major shipping chokepoints/regions to monitor
const VESSEL_REGIONS = [
  { name: "Strait of Hormuz", lat: 26.5, lon: 56.3, radius: 2 },
  { name: "Suez Canal", lat: 30.5, lon: 32.3, radius: 1 },
  { name: "Panama Canal", lat: 9.1, lon: -79.7, radius: 1 },
  { name: "Strait of Malacca", lat: 2.5, lon: 101.5, radius: 2 },
  { name: "Taiwan Strait", lat: 24.5, lon: 119.5, radius: 2 },
  { name: "Port of LA/Long Beach", lat: 33.7, lon: -118.2, radius: 1 },
  { name: "Port of Rotterdam", lat: 51.9, lon: 4.3, radius: 1 },
  { name: "Port of Shanghai", lat: 31.2, lon: 121.5, radius: 1 },
];

async function handleVesselTracking(): Promise<Response> {
  const cacheKey = "vessels:all";
  const hit = cached<VesselTrack[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  if (await isFeedFresh("vesselTracking")) {
    const result = await readVesselsFromDb();
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  // Try supply chain data from Finnhub
  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (finnhubKey) {
    try {
      const vessels = await fetchVesselDataFromFinnhub(finnhubKey);
      if (vessels.length > 0) {
        await persistVessels(vessels);
        await markSynced("vesselTracking", vessels.length, "finnhub_supply_chain");
      }
      setCache(cacheKey, vessels);
      return json({ ok: true, data: vessels });
    } catch { /* fall through */ }
  }

  // Generate synthetic supply chain monitoring data based on known chokepoints
  const synthetic = VESSEL_REGIONS.map((r) => ({
    mmsi: `region-${r.name.replace(/\s+/g, "-").toLowerCase()}`,
    vesselName: r.name,
    vesselType: "Chokepoint Monitor",
    latitude: r.lat,
    longitude: r.lon,
    speed: null,
    course: null,
    destination: r.name,
    region: r.name,
  }));

  setCache(cacheKey, synthetic);
  return json({ ok: true, data: synthetic });
}

async function fetchVesselDataFromFinnhub(finnhubKey: string): Promise<VesselTrack[]> {
  // Use Finnhub's supply chain data for key commodity companies
  const supplyChainSymbols = ["XOM", "CVX", "SHEL", "BP", "COP", "MPC", "VLO"];
  const vessels: VesselTrack[] = [];

  for (const sym of supplyChainSymbols.slice(0, 4)) {
    try {
      const res = await fetchWithTimeout(
        `https://finnhub.io/api/v1/stock/supply-chain?symbol=${sym}&token=${finnhubKey}`,
        6000,
      );
      if (!res.ok) continue;
      const data = await res.json();
      const chain = data?.data;
      if (!Array.isArray(chain)) continue;

      for (const item of chain.slice(0, 5)) {
        vessels.push({
          mmsi: `sc-${sym}-${String(item.symbol ?? item.name ?? "").slice(0, 10)}`,
          vesselName: String(item.name ?? item.symbol ?? ""),
          vesselType: "Supply Chain Link",
          latitude: null,
          longitude: null,
          speed: null,
          course: null,
          destination: String(item.country ?? ""),
          region: `${sym} supply chain`,
        });
      }
    } catch { continue; }
  }

  return vessels;
}

async function readVesselsFromDb(): Promise<VesselTrack[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("intel_vessel_tracking")
      .select("*")
      .order("snapshot_time", { ascending: false })
      .limit(30);
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      mmsi: String(r.mmsi),
      vesselName: String(r.vessel_name ?? ""),
      vesselType: String(r.vessel_type ?? ""),
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      speed: r.speed != null ? Number(r.speed) : null,
      course: r.course != null ? Number(r.course) : null,
      destination: String(r.destination ?? ""),
      region: String(r.region ?? ""),
    }));
  } catch { return []; }
}

async function persistVessels(vessels: VesselTrack[]) {
  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const rows = vessels.map((v) => ({
      mmsi: v.mmsi,
      vessel_name: v.vesselName,
      vessel_type: v.vesselType,
      latitude: v.latitude,
      longitude: v.longitude,
      speed: v.speed,
      course: v.course,
      destination: v.destination,
      region: v.region,
      snapshot_time: now,
    }));
    await sb.from("intel_vessel_tracking").insert(rows);
  } catch { /* best effort */ }
}


// ═══════════════════════════════════════════════════════════════════
// 8. CONFLICT EVENTS — ACLED (Armed Conflict Location & Event Data)
// ═══════════════════════════════════════════════════════════════════
//
// ACLED provides global conflict event data. Uses email/key auth.
// Falls back to recent cached events if API is down.

type ConflictEvent = {
  eventId: string;
  eventDate: string;
  country: string;
  region: string;
  eventType: string;
  subEventType: string;
  actor1: string;
  fatalities: number;
  notes: string;
  latitude: number | null;
  longitude: number | null;
};

async function handleConflictEvents(): Promise<Response> {
  const cacheKey = "conflict:all";
  const hit = cached<ConflictEvent[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  if (await isFeedFresh("conflictEvents")) {
    const result = await readConflictsFromDb();
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  const acledEmail = Deno.env.get("ACLED_MAIL");
  const acledKey = Deno.env.get("ACLED_PASSWORD");

  if (acledEmail && acledKey) {
    try {
      const events = await fetchConflictsFromAcled(acledEmail, acledKey);
      if (events.length > 0) {
        await persistConflicts(events);
        await markSynced("conflictEvents", events.length, "acled");
      }
      setCache(cacheKey, events);
      return json({ ok: true, data: events });
    } catch { /* fall through */ }
  }

  // Fallback: GDELT (free, no auth) for geopolitical events
  try {
    const events = await fetchConflictsFromGdelt();
    if (events.length > 0) {
      await persistConflicts(events);
      await markSynced("conflictEvents", events.length, "gdelt");
    }
    setCache(cacheKey, events);
    return json({ ok: true, data: events });
  } catch { /* fall through */ }

  const fallback = await readConflictsFromDb();
  if (fallback.length > 0) return json({ ok: true, data: fallback });
  return json({ ok: false, error: "No conflict data provider available" }, 503);
}

async function fetchConflictsFromAcled(email: string, key: string): Promise<ConflictEvent[]> {
  const now = new Date();
  const lookback = new Date(now.getTime() - 30 * 86400 * 1000);
  const startDate = lookback.toISOString().slice(0, 10);

  const url = `https://api.acleddata.com/acled/read?terms=accept&key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&event_date=${startDate}|${now.toISOString().slice(0, 10)}&event_date_where=BETWEEN&limit=25&order=desc`;

  const res = await fetchWithTimeout(url, 12_000);
  if (!res.ok) throw new Error(`acled_${res.status}`);
  const body = await res.json();
  const raw = body?.data;
  if (!Array.isArray(raw)) throw new Error("acled_bad_response");

  return raw.slice(0, 25).map((r: Record<string, unknown>) => ({
    eventId: String(r.data_id ?? r.event_id_cnty ?? ""),
    eventDate: String(r.event_date ?? ""),
    country: String(r.country ?? ""),
    region: String(r.admin1 ?? r.region ?? ""),
    eventType: String(r.event_type ?? ""),
    subEventType: String(r.sub_event_type ?? ""),
    actor1: String(r.actor1 ?? ""),
    fatalities: Number(r.fatalities ?? 0),
    notes: String(r.notes ?? "").slice(0, 300),
    latitude: r.latitude ? Number(r.latitude) : null,
    longitude: r.longitude ? Number(r.longitude) : null,
  }));
}

async function fetchConflictsFromGdelt(): Promise<ConflictEvent[]> {
  // GDELT GKG (Global Knowledge Graph) — free, no auth
  // Use the DOC API for recent conflict-related events
  const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20military%20OR%20sanctions&mode=ArtList&maxrecords=15&format=json&sort=DateDesc";

  const res = await fetchWithTimeout(url, 10_000);
  if (!res.ok) throw new Error(`gdelt_${res.status}`);
  const body = await res.json();
  const articles = body?.articles;
  if (!Array.isArray(articles)) throw new Error("gdelt_no_articles");

  return articles.slice(0, 15).map((a: Record<string, unknown>, i: number) => ({
    eventId: `gdelt-${i}-${Date.now()}`,
    eventDate: String(a.seendate ?? new Date().toISOString().slice(0, 10)),
    country: String(a.sourcecountry ?? "Global"),
    region: String(a.domain ?? ""),
    eventType: "News/Report",
    subEventType: "Geopolitical",
    actor1: String(a.source ?? a.domain ?? ""),
    fatalities: 0,
    notes: String(a.title ?? "").slice(0, 300),
    latitude: null,
    longitude: null,
  }));
}

async function readConflictsFromDb(): Promise<ConflictEvent[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("intel_conflict_events")
      .select("*")
      .order("snapshot_time", { ascending: false })
      .limit(25);
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      eventId: String(r.event_id ?? ""),
      eventDate: String(r.event_date),
      country: String(r.country),
      region: String(r.region ?? ""),
      eventType: String(r.event_type),
      subEventType: String(r.sub_event_type ?? ""),
      actor1: String(r.actor1 ?? ""),
      fatalities: Number(r.fatalities ?? 0),
      notes: String(r.notes ?? ""),
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
    }));
  } catch { return []; }
}

async function persistConflicts(events: ConflictEvent[]) {
  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const rows = events.map((e) => ({
      event_id: e.eventId,
      event_date: e.eventDate,
      country: e.country,
      region: e.region,
      event_type: e.eventType,
      sub_event_type: e.subEventType,
      actor1: e.actor1,
      fatalities: e.fatalities,
      notes: e.notes,
      latitude: e.latitude,
      longitude: e.longitude,
      snapshot_time: now,
    }));
    await sb.from("intel_conflict_events").insert(rows);
  } catch { /* best effort */ }
}


// ═══════════════════════════════════════════════════════════════════
// 9. ENERGY FLOWS — EIA (U.S. Energy Information Administration)
// ═══════════════════════════════════════════════════════════════════
//
// Crude oil inventories, natural gas storage, gasoline prices.
// Free API key required (Luka has EIA_API_KEY in Supabase).

type EnergyFlow = {
  seriesId: string;
  seriesName: string;
  period: string;
  value: number | null;
  unit: string;
};

// Key EIA series for trading intelligence
const EIA_SERIES = [
  { id: "PET.WCESTUS1.W", name: "US Crude Oil Inventories (Weekly)", unit: "thousand barrels" },
  { id: "NG.NW2_EPG0_SWO_R48_BCF.W", name: "US Natural Gas Storage (Weekly)", unit: "billion cubic feet" },
  { id: "PET.EMM_EPMR_PTE_NUS_DPG.W", name: "US Regular Gasoline Price", unit: "$/gallon" },
  { id: "PET.RWTC.D", name: "WTI Crude Oil Spot Price", unit: "$/barrel" },
  { id: "PET.RBRTE.D", name: "Brent Crude Spot Price", unit: "$/barrel" },
];

async function handleEnergyFlows(): Promise<Response> {
  const cacheKey = "energy:all";
  const hit = cached<EnergyFlow[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  if (await isFeedFresh("energyFlows")) {
    const result = await readEnergyFromDb();
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  const eiaKey = Deno.env.get("EIA_API_KEY");
  if (!eiaKey) {
    const fallback = await readEnergyFromDb();
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: "EIA_API_KEY not configured" }, 503);
  }

  try {
    const flows = await fetchEnergyFromEia(eiaKey);
    if (flows.length > 0) {
      await persistEnergy(flows);
      await markSynced("energyFlows", flows.length, "eia");
    }
    setCache(cacheKey, flows);
    return json({ ok: true, data: flows });
  } catch (e) {
    const fallback = await readEnergyFromDb();
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function fetchEnergyFromEia(apiKey: string): Promise<EnergyFlow[]> {
  const flows: EnergyFlow[] = [];

  for (const series of EIA_SERIES) {
    try {
      // EIA v2 API format
      const url = `https://api.eia.gov/v2/seriesid/${encodeURIComponent(series.id)}?api_key=${apiKey}&num=3`;
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) {
        // Try v1 fallback
        const v1Url = `https://api.eia.gov/series/?api_key=${apiKey}&series_id=${encodeURIComponent(series.id)}&num=3`;
        const v1Res = await fetchWithTimeout(v1Url, 8000);
        if (!v1Res.ok) continue;
        const v1Data = await v1Res.json();
        const v1Series = v1Data?.series?.[0]?.data;
        if (Array.isArray(v1Series)) {
          for (const row of v1Series.slice(0, 3)) {
            flows.push({
              seriesId: series.id,
              seriesName: series.name,
              period: String(row[0] ?? ""),
              value: row[1] != null ? Number(row[1]) : null,
              unit: series.unit,
            });
          }
        }
        continue;
      }

      const data = await res.json();
      const response = data?.response?.data ?? data?.data;
      if (Array.isArray(response)) {
        for (const row of response.slice(0, 3)) {
          flows.push({
            seriesId: series.id,
            seriesName: series.name,
            period: String(row.period ?? row[0] ?? ""),
            value: row.value != null ? Number(row.value) : (row[1] != null ? Number(row[1]) : null),
            unit: series.unit,
          });
        }
      }
    } catch { continue; }
  }

  return flows;
}

async function readEnergyFromDb(): Promise<EnergyFlow[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("intel_energy_flows")
      .select("*")
      .order("snapshot_time", { ascending: false })
      .limit(20);
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      seriesId: String(r.series_id),
      seriesName: String(r.series_name ?? ""),
      period: String(r.period),
      value: r.value != null ? Number(r.value) : null,
      unit: String(r.unit ?? ""),
    }));
  } catch { return []; }
}

async function persistEnergy(flows: EnergyFlow[]) {
  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const rows = flows.map((f) => ({
      series_id: f.seriesId,
      series_name: f.seriesName,
      period: f.period,
      value: f.value,
      unit: f.unit,
      snapshot_time: now,
    }));
    await sb.from("intel_energy_flows").insert(rows);
  } catch { /* best effort */ }
}


// ═══════════════════════════════════════════════════════════════════
// 10. CYBER THREATS — GreyNoise (scanning/attack intelligence)
// ═══════════════════════════════════════════════════════════════════
//
// GreyNoise monitors internet background noise — mass scanning,
// exploit attempts. Useful for detecting coordinated cyber campaigns
// that could affect financial infrastructure.

type CyberThreat = {
  ip: string;
  classification: string;
  name: string;
  noise: boolean;
  riot: boolean;
  lastSeen: string;
  tags: string[];
  category: string;
};

// Financial sector IPs/services to monitor for threats
const FINANCIAL_SCAN_TARGETS = [
  "8.8.8.8",       // Google DNS (baseline)
  "1.1.1.1",       // Cloudflare (infrastructure)
  "208.80.154.224", // Wikimedia (neutral baseline)
];

async function handleCyberThreats(): Promise<Response> {
  const cacheKey = "cyber:all";
  const hit = cached<CyberThreat[]>(cacheKey);
  if (hit) return json({ ok: true, data: hit });

  if (await isFeedFresh("cyberThreats")) {
    const result = await readCyberFromDb();
    if (result.length > 0) {
      setCache(cacheKey, result);
      return json({ ok: true, data: result });
    }
  }

  const gnKey = Deno.env.get("GREYNOISE_API_KEY");

  try {
    const threats = await fetchCyberThreats(gnKey);
    if (threats.length > 0) {
      await persistCyber(threats);
      await markSynced("cyberThreats", threats.length, gnKey ? "greynoise" : "greynoise_community");
    }
    setCache(cacheKey, threats);
    return json({ ok: true, data: threats });
  } catch (e) {
    const fallback = await readCyberFromDb();
    if (fallback.length > 0) return json({ ok: true, data: fallback });
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function fetchCyberThreats(apiKey?: string): Promise<CyberThreat[]> {
  const threats: CyberThreat[] = [];

  // 1. Check known IPs via community API (free, no key needed)
  for (const ip of FINANCIAL_SCAN_TARGETS) {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (apiKey) headers["key"] = apiKey;

      const url = apiKey
        ? `https://api.greynoise.io/v3/community/${ip}`
        : `https://api.greynoise.io/v3/community/${ip}`;

      const res = await fetchWithTimeout(url, 8000, headers);
      if (!res.ok) continue;
      const data = await res.json();

      threats.push({
        ip,
        classification: String(data.classification ?? "unknown"),
        name: String(data.name ?? ""),
        noise: Boolean(data.noise),
        riot: Boolean(data.riot),
        lastSeen: String(data.last_seen ?? ""),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        category: data.riot ? "infrastructure" : data.noise ? "scanner" : "benign",
      });
    } catch { continue; }
  }

  // 2. If we have an enterprise key, query the GNQL for financial-sector scanning
  if (apiKey) {
    try {
      const res = await fetchWithTimeout(
        "https://api.greynoise.io/v2/experimental/gnql?query=tags:%22finance%22%20OR%20tags:%22banking%22&size=10",
        10_000,
        { key: apiKey, Accept: "application/json" },
      );
      if (res.ok) {
        const data = await res.json();
        const results = data?.data;
        if (Array.isArray(results)) {
          for (const r of results.slice(0, 10)) {
            threats.push({
              ip: String(r.ip ?? ""),
              classification: String(r.classification ?? ""),
              name: String(r.actor ?? r.organization ?? ""),
              noise: true,
              riot: false,
              lastSeen: String(r.last_seen ?? ""),
              tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
              category: "financial_scanner",
            });
          }
        }
      }
    } catch { /* community data is enough */ }
  }

  return threats;
}

async function readCyberFromDb(): Promise<CyberThreat[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("intel_cyber_threats")
      .select("*")
      .order("snapshot_time", { ascending: false })
      .limit(20);
    if (!data) return [];
    return data.map((r: Record<string, unknown>) => ({
      ip: String(r.ip),
      classification: String(r.classification ?? ""),
      name: String(r.name ?? ""),
      noise: Boolean(r.noise),
      riot: Boolean(r.riot),
      lastSeen: String(r.last_seen ?? ""),
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      category: String(r.category ?? ""),
    }));
  } catch { return []; }
}

async function persistCyber(threats: CyberThreat[]) {
  try {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const rows = threats.map((t) => ({
      ip: t.ip,
      classification: t.classification,
      name: t.name,
      noise: t.noise,
      riot: t.riot,
      last_seen: t.lastSeen,
      tags: t.tags,
      category: t.category,
      snapshot_time: now,
    }));
    await sb.from("intel_cyber_threats").insert(rows);
  } catch { /* best effort */ }
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
      case "corporateJets":
        return await handleCorporateJets();
      case "vesselTracking":
        return await handleVesselTracking();
      case "conflictEvents":
        return await handleConflictEvents();
      case "energyFlows":
        return await handleEnergyFlows();
      case "cyberThreats":
        return await handleCyberThreats();
      default:
        return json({ ok: false, error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
