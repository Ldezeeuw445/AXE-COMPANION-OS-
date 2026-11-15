import assert from "node:assert/strict";
import { test } from "node:test";
import { candleCacheKey, createCandleCache } from "./candleCache";

test("different symbols never share cached candles", async () => {
  const calls: string[] = [];
  const cache = createCandleCache(async (symbol, tf) => {
    calls.push(`${symbol}:${tf}`);
    return { symbol, tf };
  });
  const gold = await cache.get("XAUUSD", "h1");
  const eur = await cache.get("EURUSD", "h1");
  assert.equal(gold.symbol, "XAUUSD");
  assert.equal(eur.symbol, "EURUSD");
  assert.deepEqual(calls, ["XAUUSD:h1", "EURUSD:h1"]);
});

test("same symbol+timeframe loads once, other timeframe loads separately", async () => {
  let n = 0;
  const cache = createCandleCache(async (symbol, tf) => ({ symbol, tf, n: ++n }));
  const a = await cache.get("xauusd", "h1");
  const b = await cache.get("XAUUSD", "H1");
  const c = await cache.get("XAUUSD", "m15");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(n, 2);
});

test("failed load is not cached", async () => {
  let n = 0;
  const cache = createCandleCache(async () => {
    n += 1;
    if (n === 1) throw new Error("boom");
    return "ok";
  });
  await assert.rejects(() => cache.get("XAUUSD", "h1"));
  assert.equal(await cache.get("XAUUSD", "h1"), "ok");
});

test("key normalises case and whitespace", () => {
  assert.equal(candleCacheKey(" xauusd ", "H1"), candleCacheKey("XAUUSD", "h1"));
  assert.notEqual(candleCacheKey("XAUUSD", "h1"), candleCacheKey("EURUSD", "h1"));
});
