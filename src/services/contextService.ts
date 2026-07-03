/**
 * contextService — compatibility entry point for AXE context.
 *
 * Phase 3A keeps the public `fetchTradingOSContext` export stable for chat and
 * /api/context while the actual work moves into the Companion-native builder.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxeCompanionContext, TradingOSContext } from "@/types/context";
import {
  buildAxeCompanionContext,
  buildTradingOSCompatibleContext,
} from "@/services/axeContextBuilder";
import { logLatencyIfDue, recordLatencySample } from "@/lib/perf/latencyStats";

type ContextCacheMode = "default" | "bypass" | "refresh";

type FetchTradingOSContextOptions = {
  cacheMode?: ContextCacheMode;
  ttlMs?: number;
};

type TradingContextCacheEntry = {
  value: TradingOSContext;
  expiresAt: number;
  updatedAt: number;
};

const CONTEXT_CACHE_TTL_MS = Number(process.env.AXE_CONTEXT_CACHE_TTL_MS ?? 12_000);
const CONTEXT_CACHE_MAX_ENTRIES = Number(process.env.AXE_CONTEXT_CACHE_MAX_ENTRIES ?? 120);
const tradingContextCache = new Map<string, TradingContextCacheEntry>();

const COMMODITY_CURRENCIES: Record<string, string[]> = {
  XAU: ["USD"],
  XAG: ["USD"],
  WTI: ["USD"],
  OIL: ["USD"],
};

function compactToken(v?: string | null): string {
  return (v ?? "").toString().trim().toUpperCase();
}

function cacheKey(userId: string, symbol?: string | null, tf?: string | null, pinnedContext?: string | null): string {
  // Keep key stable and cheap; include tiny pinned-context fingerprint.
  const pinned = (pinnedContext ?? "").trim();
  const pinnedSig = pinned ? `${pinned.length}:${pinned.slice(0, 18).replace(/\s+/g, " ")}` : "";
  return `${userId}|${compactToken(symbol)}|${compactToken(tf)}|${pinnedSig}`;
}

function trimContextCache(): void {
  const now = Date.now();
  for (const [key, entry] of tradingContextCache.entries()) {
    if (entry.expiresAt <= now) {
      tradingContextCache.delete(key);
    }
  }
  if (tradingContextCache.size <= CONTEXT_CACHE_MAX_ENTRIES) return;

  const oldest = [...tradingContextCache.entries()]
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    .slice(0, tradingContextCache.size - CONTEXT_CACHE_MAX_ENTRIES);
  for (const [key] of oldest) {
    tradingContextCache.delete(key);
  }
}

export function invalidateTradingOSContextCache(userId?: string): void {
  if (!userId) {
    tradingContextCache.clear();
    return;
  }
  const prefix = `${userId}|`;
  for (const key of tradingContextCache.keys()) {
    if (key.startsWith(prefix)) {
      tradingContextCache.delete(key);
    }
  }
}

/**
 * Given a trading symbol (e.g. "XAUUSD", "GBPJPY", "ES"), return the currencies
 * that drive price action and should be watched in the economic calendar.
 */
export function symbolToCurrencies(symbol: string): string[] {
  if (!symbol) return [];
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");

  if (s.length === 6) {
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    if (COMMODITY_CURRENCIES[base]) return [...COMMODITY_CURRENCIES[base]];
    return [...new Set([base, quote])];
  }

  if (["ES", "NQ", "YM", "RTY", "CL", "GC", "SI", "NG"].includes(s)) {
    return ["USD"];
  }

  if (["BTC", "ETH", "SOL"].includes(s)) return ["USD"];
  return [s.length <= 3 ? s : "USD"];
}

export async function fetchAxeCompanionContext(
  userId: string,
  supabase: SupabaseClient,
  symbol?: string | null,
  tf?: string | null,
  pinnedContext?: string | null,
): Promise<AxeCompanionContext> {
  return buildAxeCompanionContext({ userId, supabase, symbol, tf, pinnedContext });
}

export async function fetchTradingOSContext(
  userId: string,
  supabase: SupabaseClient,
  symbol?: string | null,
  tf?: string | null,
  pinnedContext?: string | null,
  options?: FetchTradingOSContextOptions,
): Promise<TradingOSContext> {
  const startedAt = Date.now();
  const mode = options?.cacheMode ?? "default";
  const ttlMs = Math.max(2_000, options?.ttlMs ?? CONTEXT_CACHE_TTL_MS);
  const key = cacheKey(userId, symbol, tf, pinnedContext);

  if (mode === "default") {
    const cached = tradingContextCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      recordLatencySample("context.fetch.cache_hit_ms", Date.now() - startedAt);
      logLatencyIfDue("context.fetch.cache_hit_ms", 25);
      return cached.value;
    }
  }

  const buildStartedAt = Date.now();
  const fresh = await buildTradingOSCompatibleContext({ userId, supabase, symbol, tf, pinnedContext });
  recordLatencySample("context.fetch.build_ms", Date.now() - buildStartedAt);
  logLatencyIfDue("context.fetch.build_ms", 20);
  tradingContextCache.set(key, {
    value: fresh,
    expiresAt: Date.now() + ttlMs,
    updatedAt: Date.now(),
  });
  trimContextCache();
  recordLatencySample("context.fetch.total_ms", Date.now() - startedAt);
  logLatencyIfDue("context.fetch.total_ms", 20);
  return fresh;
}

/**
 * Precompute lane for next turn latency:
 * - refresh current context
 * - best-effort warm one watchlist symbol context
 */
export async function precomputeTradingOSContextLane(
  userId: string,
  supabase: SupabaseClient,
  symbol?: string | null,
  tf?: string | null,
  pinnedContext?: string | null,
): Promise<void> {
  const startedAt = Date.now();
  const base = await fetchTradingOSContext(userId, supabase, symbol, tf, pinnedContext, {
    cacheMode: "refresh",
  });
  const warmSymbol =
    base.account_state.watchlist?.[0]?.symbol ??
    base.axe_context?.chart?.symbol ??
    null;
  if (!warmSymbol) return;
  const normalizedPrimary = compactToken(symbol ?? base.symbol ?? null);
  if (compactToken(warmSymbol) === normalizedPrimary) return;
  await fetchTradingOSContext(userId, supabase, warmSymbol, tf ?? base.timeframe ?? null, pinnedContext, {
    cacheMode: "refresh",
  });
  recordLatencySample("context.precompute_lane_ms", Date.now() - startedAt);
  logLatencyIfDue("context.precompute_lane_ms", 20);
}
