import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clientGetHistoricalCandles, clientGetSymbolPrice } from "@/lib/mt5/metaApiClient";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { getMetadataSymbolMap } from "@/lib/broker/brokerSymbolRuntime";
import {
  computeSymbolFacts,
  isPriceFresh,
  type PriceCandle,
  type SymbolFactsResult,
  type SymbolPriceFacts,
} from "@/lib/briefing/priceFacts";

/**
 * Real prices for a briefing, in this order:
 *
 *  1. The trader's own MT5 broker feed through MetaApi (current price +
 *     daily candles of the broker symbol) — the same prices as their account.
 *     Only GETs; skipped when the terminal is not running (undeployed), which
 *     is the case for every account since 2026-11-12. Nothing here deploys.
 *  2. Twelve Data spot (XAU/USD, BTC/USD, EUR/USD …) — TWELVEDATA_API_KEY.
 *  3. Yahoo Finance (gold only as COMEX futures GC=F, labelled as such).
 *
 * Each result names its source and timestamp. Nothing is ever made up: a
 * symbol no source can price fresh comes back `ok: false`, and the brief must
 * say its data is unavailable.
 */

const STEP_BUDGET_MS = 6_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; facts: SymbolPriceFacts }>();

async function withBudget<T>(p: Promise<T>, ms = STEP_BUDGET_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// ─── 1. MT5 broker feed ───────────────────────────────────────────────────────

type BrokerFeed = { metaApiAccountId: string; region: string | null; symbolMap: Record<string, string> };

async function loadBrokerFeed(supabase: SupabaseClient, userId: string): Promise<BrokerFeed | null> {
  if (!getMetaApiToken()) return null;
  const { data: prefs } = await supabase
    .from("user_workspace_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: rows } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,external_connection_id,provider_status,status,metadata")
    .eq("user_id", userId)
    .eq("connection_method", "cloud_mt5")
    .eq("status", "active");
  const usable = (rows ?? []).filter(
    (r) =>
      r.external_connection_id &&
      // A terminal that is not running answers every call with a 404 or hangs.
      !["undeployed", "deploying", "disconnected"].includes(String(r.provider_status ?? "").toLowerCase()),
  );
  const row = usable.find((r) => r.id === prefs?.active_account_id) ?? usable[0];
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    metaApiAccountId: String(row.external_connection_id),
    region: typeof meta.metaapiRegion === "string" ? meta.metaapiRegion : null,
    symbolMap: getMetadataSymbolMap(meta),
  };
}

async function fromBroker(feed: BrokerFeed, symbol: string, now: Date): Promise<SymbolPriceFacts | null> {
  const brokerSymbol = feed.symbolMap[symbol] ?? null;
  if (!brokerSymbol) return null;
  const [price, candles] = await Promise.all([
    withBudget(clientGetSymbolPrice(feed.metaApiAccountId, brokerSymbol, feed.region)),
    withBudget(clientGetHistoricalCandles(feed.metaApiAccountId, brokerSymbol, "1d", 30, feed.region)),
  ]);
  if (!price || (price.bid == null && price.ask == null) || !candles?.length) return null;
  const mid = price.bid != null && price.ask != null ? (price.bid + price.ask) / 2 : (price.bid ?? price.ask)!;
  return computeSymbolFacts({
    symbol,
    source: "mt5_broker",
    sourceLabel: `your MT5 broker feed (${brokerSymbol})`,
    dailyCandles: candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    lastPrice: mid,
    asOf: price.time ?? null,
    now,
  });
}

// ─── 2. Twelve Data ───────────────────────────────────────────────────────────

export function twelveDataSymbol(symbol: string): string | null {
  const up = symbol.toUpperCase().replace("/", "");
  if (/^(XAU|XAG|XPT|XPD|BTC|ETH|SOL|XRP|LTC)USD$/.test(up)) return `${up.slice(0, 3)}/USD`;
  if (/^[A-Z]{6}$/.test(up)) return `${up.slice(0, 3)}/${up.slice(3)}`;
  return null;
}

type TdValue = { datetime: string; open: string; high: string; low: string; close: string };

async function tdSeries(sym: string, interval: string, size: number, key: string): Promise<TdValue[] | null> {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=${size}&timezone=UTC&apikey=${encodeURIComponent(key)}`;
  const res = await withBudget(fetch(url, { cache: "no-store" }));
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { status?: string; values?: TdValue[] } | null;
  if (!body || body.status !== "ok" || !Array.isArray(body.values)) return null;
  return body.values;
}

const tdIso = (dt: string) => (dt.length <= 10 ? `${dt}T00:00:00Z` : `${dt.replace(" ", "T")}Z`);

async function fromTwelveData(symbol: string, now: Date): Promise<SymbolPriceFacts | null> {
  const key = process.env.TWELVEDATA_API_KEY?.trim() || process.env.TWELVE_DATA_API_KEY?.trim();
  const sym = twelveDataSymbol(symbol);
  if (!key || !sym) return null;
  const [daily, last] = await Promise.all([tdSeries(sym, "1day", 30, key), tdSeries(sym, "5min", 1, key)]);
  if (!daily?.length || !last?.length) return null;
  const candles: PriceCandle[] = daily.map((v) => ({
    time: tdIso(v.datetime),
    open: num(v.open),
    high: num(v.high),
    low: num(v.low),
    close: num(v.close),
  }));
  // The 5-minute bar's open time + 5 min is when its close was observed.
  const asOf = new Date(Date.parse(tdIso(last[0].datetime)) + 5 * 60 * 1000);
  return computeSymbolFacts({
    symbol,
    source: "twelve_data",
    sourceLabel: `Twelve Data spot ${sym}`,
    dailyCandles: candles,
    lastPrice: num(last[0].close),
    asOf: (asOf.getTime() > now.getTime() ? now : asOf).toISOString(),
    now,
  });
}

// ─── 3. Yahoo ─────────────────────────────────────────────────────────────────

const YAHOO: Record<string, { ticker: string; label: string; futures: boolean }> = {
  XAUUSD: { ticker: "GC=F", label: "Yahoo COMEX gold futures GC=F (not spot)", futures: true },
  XAGUSD: { ticker: "SI=F", label: "Yahoo COMEX silver futures SI=F (not spot)", futures: true },
  BTCUSD: { ticker: "BTC-USD", label: "Yahoo BTC-USD", futures: false },
  ETHUSD: { ticker: "ETH-USD", label: "Yahoo ETH-USD", futures: false },
};

async function fromYahoo(symbol: string, now: Date): Promise<SymbolPriceFacts | null> {
  const up = symbol.toUpperCase();
  const spec = YAHOO[up] ?? (/^[A-Z]{6}$/.test(up) ? { ticker: `${up}=X`, label: `Yahoo ${up}=X`, futures: false } : null);
  if (!spec) return null;
  const res = await withBudget(
    fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.ticker)}?interval=1d&range=1mo`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
    }),
  );
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number }; timestamp?: number[]; indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[] }> } }> };
  } | null;
  const r = body?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.meta?.regularMarketPrice || !r.meta.regularMarketTime || !r.timestamp || !q) return null;
  const candles: PriceCandle[] = r.timestamp.map((t, i) => ({
    time: new Date(t * 1000).toISOString(),
    open: num(q.open?.[i]),
    high: num(q.high?.[i]),
    low: num(q.low?.[i]),
    close: num(q.close?.[i]),
  }));
  return computeSymbolFacts({
    symbol,
    source: spec.futures ? "yahoo_futures" : "yahoo",
    sourceLabel: spec.label,
    dailyCandles: candles,
    lastPrice: r.meta.regularMarketPrice,
    asOf: new Date(r.meta.regularMarketTime * 1000).toISOString(),
    now,
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function loadBriefPriceFacts(
  supabase: SupabaseClient,
  userId: string,
  symbols: string[],
  now = new Date(),
): Promise<SymbolFactsResult[]> {
  const wanted = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))).slice(0, 4);
  const feed = await loadBrokerFeed(supabase, userId).catch(() => null);
  const out: SymbolFactsResult[] = [];
  for (const symbol of wanted) {
    const tried: string[] = [];
    let facts: SymbolPriceFacts | null = null;
    if (feed) {
      facts = await fromBroker(feed, symbol, now);
      if (!facts || !isPriceFresh(symbol, facts.asOf, now)) {
        tried.push("MT5 broker feed");
        facts = null;
      }
    } else {
      tried.push("MT5 broker feed (terminal not running)");
    }
    if (!facts) {
      const hit = cache.get(symbol);
      if (hit && now.getTime() - hit.at < CACHE_TTL_MS && isPriceFresh(symbol, hit.facts.asOf, now)) facts = hit.facts;
    }
    for (const [name, load] of [
      ["Twelve Data", fromTwelveData],
      ["Yahoo", fromYahoo],
    ] as const) {
      if (facts) break;
      const got = await load(symbol, now);
      if (got && isPriceFresh(symbol, got.asOf, now)) {
        facts = got;
        cache.set(symbol, { at: now.getTime(), facts: got });
      } else {
        tried.push(name);
      }
    }
    out.push(facts ? { ok: true, facts } : { ok: false, symbol, reason: `no fresh price from ${tried.join(", ")}` });
  }
  return out;
}
