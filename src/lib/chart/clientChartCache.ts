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
 *
 * Offline: the last snapshot per symbol+timeframe is kept even after the
 * fresh window. Age is labelled in the UI; it is not deleted on TTL.
 */

import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import { CANDLE_FRESH_MS } from "@/lib/pwa/staleAge";

export type ChartCacheWriteInput = {
  symbol: string;
  brokerSymbol: string;
  timeframeKey: string;
  candles: MetaApiCandle[];
  lastPrice: number | null;
  source?: string | null;
};

const STORAGE_PREFIX = "axe.chartCache.";
const MAX_ENTRIES = 20;

export type CachedChartSnapshot = {
  symbol: string;
  brokerSymbol: string;
  timeframeKey: string;
  candles: MetaApiCandle[];
  lastPrice: number | null;
  savedAt: number;
};

function storage(): Storage | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (!store) return null;
    return store;
  } catch {
    return null;
  }
}

function cacheKey(symbol: string, tf: string): string {
  return `${STORAGE_PREFIX}${symbol.toUpperCase()}.${tf}`;
}

export function isCachedChartFresh(
  snapshot: CachedChartSnapshot | null | undefined,
  now = Date.now(),
): boolean {
  if (!snapshot) return false;
  return now - snapshot.savedAt <= CANDLE_FRESH_MS;
}

/** Read last cached candles for a symbol+timeframe. Returns null only if missing. */
export function readCachedChart(
  symbol: string,
  tf: string,
): CachedChartSnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(cacheKey(symbol, tf));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedChartSnapshot;
    if (!parsed.candles || parsed.candles.length === 0) return null;
    if (!Number.isFinite(parsed.savedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Save chart data to localStorage cache. */
export function writeCachedChart(data: ChartCacheWriteInput, savedAt = Date.now()): void {
  const store = storage();
  if (!store) return;
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
      savedAt,
    };
    store.setItem(
      cacheKey(data.symbol, data.timeframeKey),
      JSON.stringify(snapshot),
    );
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/** Prefetch adjacent timeframes that are missing or past the fresh window. */
export function prefetchTimeframes(
  currentTf: string,
  symbol: string,
  now = Date.now(),
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
  return neighbors.filter((tf) => !isCachedChartFresh(readCachedChart(symbol, tf), now));
}

function evictOldEntries(): void {
  const store = storage();
  if (!store) return;
  try {
    const entries: { key: string; savedAt: number }[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      try {
        const raw = store.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { savedAt?: number };
        entries.push({ key, savedAt: parsed.savedAt ?? 0 });
      } catch {
        store.removeItem(key!);
      }
    }
    if (entries.length <= MAX_ENTRIES) return;
    entries.sort((a, b) => a.savedAt - b.savedAt);
    const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
    for (const { key } of toRemove) store.removeItem(key);
  } catch {
    // Ignore
  }
}
