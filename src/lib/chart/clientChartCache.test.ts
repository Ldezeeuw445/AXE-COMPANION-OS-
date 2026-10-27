import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CANDLE_FRESH_MS } from "@/lib/pwa/staleAge";
import {
  isCachedChartFresh,
  prefetchTimeframes,
  readCachedChart,
  writeCachedChart,
  type ChartCacheWriteInput,
} from "./clientChartCache";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";

const memory = new Map<string, string>();

const fakeStorage: Storage = {
  get length() {
    return memory.size;
  },
  clear() {
    memory.clear();
  },
  getItem(key: string) {
    return memory.get(key) ?? null;
  },
  key(index: number) {
    return [...memory.keys()][index] ?? null;
  },
  removeItem(key: string) {
    memory.delete(key);
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
  },
};

function candle(time: string): MetaApiCandle {
  return { time, open: 1, high: 2, low: 0.5, close: 1.5, tickVolume: 1 };
}

function page(partial: Partial<ChartCacheWriteInput> = {}): ChartCacheWriteInput {
  return {
    symbol: "XAUUSD",
    brokerSymbol: "XAUUSD",
    timeframeKey: "h1",
    candles: [candle("2026-10-21T10:00:00.000Z")],
    lastPrice: 2640,
    source: "MetaApi MT5",
    ...partial,
  };
}

describe("clientChartCache offline last snapshot", () => {
  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: fakeStorage,
    });
  });

  afterEach(() => {
    memory.clear();
  });

  it("keeps the last candles per symbol+timeframe after the fresh window", () => {
    const savedAt = Date.now() - CANDLE_FRESH_MS - 60_000;
    writeCachedChart(page(), savedAt);
    const cached = readCachedChart("XAUUSD", "h1");
    assert.ok(cached);
    assert.equal(cached?.candles.length, 1);
    assert.equal(cached?.savedAt, savedAt);
    assert.equal(isCachedChartFresh(cached), false);
  });

  it("still prefetches a timeframe whose last candles are stale", () => {
    writeCachedChart(page({ timeframeKey: "m15" }), Date.now() - CANDLE_FRESH_MS - 1);
    const missing = prefetchTimeframes("h1", "XAUUSD");
    assert.ok(missing.includes("m15"));
    assert.ok(missing.includes("h4"));
  });

  it("skips prefetch when the last candles are still fresh", () => {
    writeCachedChart(page({ timeframeKey: "m15" }), Date.now());
    const missing = prefetchTimeframes("h1", "XAUUSD");
    assert.equal(missing.includes("m15"), false);
  });
});
