import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPriceViolations, stripViolatingSentences } from "./briefPriceValidator";
import {
  computeSymbolFacts,
  formatPriceFactBlock,
  hasPriceFactsMarker,
  isFxMarketOpen,
  priceFactRules,
  toPriceFactsHighlight,
  isPriceFresh,
  type PriceCandle,
  type SymbolFactsResult,
} from "./priceFacts";

const NOW = new Date("2026-11-17T12:50:00Z"); // Tuesday

function facts(symbol: string, price: number): SymbolFactsResult {
  const f = computeSymbolFacts({
    symbol,
    source: "twelve_data",
    sourceLabel: "Twelve Data spot",
    dailyCandles: [{ time: "2026-11-17T00:00:00Z", open: price, high: price * 1.005, low: price * 0.995, close: price }],
    lastPrice: price,
    asOf: NOW.toISOString(),
    now: NOW,
  });
  assert.ok(f);
  return { ok: true, facts: f };
}

const LIVE = [facts("XAUUSD", 3860.07), facts("BTCUSD", 65001.73)];

// The 16 Nov Weekly Outlook, verbatim.
const WEEKLY_16_NOV =
  "First, keep an eye on XAUUSD as it navigates recent volatility. If it breaks above key resistance levels near 1950, it could signal a bullish move, especially with your understanding of fair value gaps. Conversely, if it fails to hold and retraces below 1920, we might see more selling pressure.\n\nFor BTCUSD, the potential for upward momentum is palpable as institutional interest strengthens. Watch for bullish patterns that might emerge near 30,000. If it holds those levels, it could create a strong buying signal.";

describe("briefing price validator", () => {
  it("catches the 16 Nov outlook: gold 1950/1920 and BTC 30,000", () => {
    const v = findPriceViolations(WEEKLY_16_NOV, LIVE);
    const values = v.map((x) => `${x.symbol}:${x.value}`).sort();
    assert.deepEqual(values, ["BTCUSD:30000", "XAUUSD:1920", "XAUUSD:1950"]);
  });

  it("passes real levels near the live price", () => {
    const text = "XAUUSD trades at 3,860.07. Resistance sits at 3,886.42 and support at 3843.64.\n\nBTCUSD holds 65,001 with the week's high at 66,200.";
    assert.deepEqual(findPriceViolations(text, LIVE), []);
  });

  it("ignores percentages, years, times, P/L, list numbers and counts", () => {
    const text =
      "You're at 62% aligned. XAUUSD: watch the 14:30 UTC CPI on 17 Nov 2026; your last gold trade made +$250 and -120.50.\n1. Size gold at 0.5 lots and wait 2 days.\n2. Look for 2-3 setups in XAUUSD.";
    assert.deepEqual(findPriceViolations(text, LIVE), []);
  });

  it("a market without live data may not get any level", () => {
    const text = "XAUUSD could test 3900.";
    const v = findPriceViolations(text, [{ ok: false, symbol: "XAUUSD", reason: "no fresh data" }]);
    assert.equal(v.length, 1);
    assert.equal(v[0].reference, null);
  });

  it("a level with no market named is not allowed", () => {
    const v = findPriceViolations("Watch for a break above resistance near 1950.", LIVE);
    assert.equal(v.length, 1);
    assert.equal(v[0].symbol, null);
  });

  it("a range written with a dash keeps both ends checked", () => {
    const v = findPriceViolations("Gold sits between 1,920–1,950.", LIVE);
    assert.equal(v.length, 2);
  });
});

describe("price facts from real candles", () => {
  const bars: PriceCandle[] = [
    // previous week (Mon 9 – Fri 13 Nov)
    { time: "2026-11-09T00:00:00Z", open: 3800, high: 3820, low: 3790, close: 3810 },
    { time: "2026-11-13T00:00:00Z", open: 3810, high: 3900, low: 3805, close: 3850 },
    // this week
    { time: "2026-11-16T00:00:00Z", open: 3850, high: 3870, low: 3840, close: 3864 },
    { time: "2026-11-17T00:00:00Z", open: 3864, high: 3886, low: 3843, close: 3860 },
  ];
  it("computes day, previous day, this week, previous week and 20-day ranges", () => {
    const f = computeSymbolFacts({ symbol: "XAUUSD", source: "twelve_data", sourceLabel: "Twelve Data spot XAU/USD", dailyCandles: bars, lastPrice: 3860.07, asOf: NOW.toISOString(), now: NOW })!;
    assert.equal(f.dayHigh, 3886);
    assert.equal(f.dayLow, 3843);
    assert.equal(f.prevDayHigh, 3870);
    assert.equal(f.weekHigh, 3886);
    assert.equal(f.weekLow, 3840);
    assert.equal(f.prevWeekHigh, 3900);
    assert.equal(f.prevWeekLow, 3790);
    assert.equal(f.range20High, 3900);
    const block = formatPriceFactBlock([{ ok: true, facts: f }, { ok: false, symbol: "AUDCAD", reason: "no source" }]);
    assert.match(block, /XAUUSD: last 3,860\.07 \(Twelve Data spot XAU\/USD, 2026-11-17 12:50 UTC\)/);
    assert.match(block, /AUDCAD: LIVE PRICE UNAVAILABLE/);
  });
  it("no last price and no candles gives nothing", () => {
    assert.equal(computeSymbolFacts({ symbol: "X", source: "yahoo", sourceLabel: "y", dailyCandles: [], lastPrice: null, asOf: null, now: NOW }), null);
  });
  it("freshness: 30 min while open, last close allowed over the weekend, crypto always open", () => {
    assert.equal(isPriceFresh("XAUUSD", new Date(NOW.getTime() - 10 * 60_000).toISOString(), NOW), true);
    assert.equal(isPriceFresh("XAUUSD", new Date(NOW.getTime() - 2 * 3600_000).toISOString(), NOW), false);
    const saturday = new Date("2026-11-21T10:00:00Z");
    assert.equal(isFxMarketOpen(saturday), false);
    assert.equal(isPriceFresh("XAUUSD", "2026-11-20T20:55:00Z", saturday), true);
    assert.equal(isPriceFresh("BTCUSD", "2026-11-20T20:55:00Z", saturday), false);
    assert.equal(isPriceFresh("XAUUSD", "2026-04-21T10:00:00Z", NOW), false);
  });
});

describe("after a failed regenerate", () => {
  it("strips every sentence with an invented level and keeps the rest", () => {
    const v = findPriceViolations(WEEKLY_16_NOV, LIVE);
    const out = stripViolatingSentences(WEEKLY_16_NOV, v);
    assert.doesNotMatch(out, /1950|1920|30,000/);
    assert.match(out, /keep an eye on XAUUSD/);
    assert.deepEqual(findPriceViolations(out, LIVE), []);
  });
  it("no live data at all: the rules forbid any level", () => {
    assert.match(priceFactRules([{ ok: false, symbol: "XAUUSD", reason: "x" }]), /No live prices are available right now/);
  });
  it("old briefs without the price-check marker are recognised", () => {
    assert.equal(hasPriceFactsMarker([{ pair: "XAUUSD" }]), false);
    assert.equal(hasPriceFactsMarker(null), false);
    const h = toPriceFactsHighlight(LIVE, NOW);
    assert.equal(hasPriceFactsMarker([{ pair: "XAUUSD" }, h]), true);
    assert.equal(h.prices[0].source, "Twelve Data spot");
    assert.equal(h.prices[0].asOf, NOW.toISOString());
  });
});
