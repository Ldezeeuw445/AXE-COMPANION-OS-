/**
 * Client-side localStorage candle cache.
 *
 * Stores the last-loaded chart data per symbol+timeframe so the next visit
 * can render candles in <50 ms while the server-side loader runs in the
 * background (12+ seconds for cold MetaAPI calls).
 *
 * Storage layout:
 *   axe.chartCache.{SYMBOL}.{TF_KEY} → JSON { candles, brokerSymbol, savedAt, lastPrice }
 *
 * Budget: ≤ 2 MB total. Each entry is capped at 500 candles (~80 KB JSON).
 * Old entries are evicted when total exceeds MAX_ENTRIES.
 */

import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartPageData } from "@/lib/broker/loadChartPageData";

const STORAGE_PREFIX = "axe.chartCache.";
const MAX_ENTRIES = 20;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — stale but better than blank

export type CachedChartSnapshot = {
  symbol: string;
  brokerSymbol: string;
  timeframeKey: string;
  candles: MetaApiCandle[];
  lastPrice: number | null;
  savedAt: number;
};

function cacheKey(symbol: string, tf: string): string {
  return `${STORAGE_PREFIX}${symbol.toUpperCase()}.${tf}`;
}

/** Read cached candles for a symbol+timeframe. Returns null if missing or stale. */
export function readCachedChart(
  symbol: string,
  tf: string,
): CachedChartSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(symbol, tf));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChartSnapshot;
    if (!parsed.candles || parsed.candles.length === 0) return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(symbol, tf));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Save chart data to localStorage cache. */
export function writeCachedChart(data: ChartPageData): void {
  if (typeof window === "undefined") return;
  if (data.candles.length === 0) return;
  if (data.source === "AXE Demo") return; // don't cache demo data

  try {
    evictOldEntries();
    const snapshot: CachedChartSnapshot = {
      symbol: data.symbol,
      brokerSymbol: data.brokerSymbol,
      timeframeKey: data.timeframeKey,
      candles: data.candles.slice(-500), // cap at 500
      lastPrice: data.lastPrice,
      savedAt: Date.now(),
    };
    localStorage.setItem(
      cacheKey(data.symbol, data.timeframeKey),
      JSON.stringify(snapshot),
    );
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/** Prefetch adjacent timeframes in the background. */
export function prefetchTimeframes(
  currentTf: string,
  symbol: string,
): string[] {
  const TF_ADJACENCY: Record<string, string[]> = {
    m1: ["m5"],
    m5: ["m15", "m1"],
    m15: ["h1", "m5"],
    h1: ["m15", "h4"],
    h4: ["h1", "d1"],
    d1: ["h4", "w1"],
    w1: ["d1", "mn"],
    mn: ["w1"],
  };
  const neighbors = TF_ADJACENCY[currentTf] ?? [];
  // Return TFs that are NOT already cached (so the caller can request them)
  return neighbors.filter((tf) => !readCachedChart(symbol, tf));
}

function evictOldEntries(): void {
  try {
    const entries: { key: string; savedAt: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { savedAt?: number };
        entries.push({ key, savedAt: parsed.savedAt ?? 0 });
      } catch {
        localStorage.removeItem(key!);
      }
    }
    if (entries.length <= MAX_ENTRIES) return;
    entries.sort((a, b) => a.savedAt - b.savedAt);
    const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
    for (const { key } of toRemove) localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
