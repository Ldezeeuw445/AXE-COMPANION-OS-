import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeChatRouteContext,
  normalizeChatSymbol,
  normalizeChatTimeframe,
} from "./normalizeChatRouteContext.ts";

describe("normalizeChatTimeframe", () => {
  it("maps TOS and MetaTrader labels onto Companion chart keys", () => {
    const cases: Array<[string, string]> = [
      ["1M", "m5"],
      ["m1", "m5"],
      ["1m", "m5"],
      ["5M", "m5"],
      ["m5", "m5"],
      ["5m", "m5"],
      ["15M", "m15"],
      ["m15", "m15"],
      ["15m", "m15"],
      ["30M", "m30"],
      ["m30", "m30"],
      ["1H", "h1"],
      ["h1", "h1"],
      ["1h", "h1"],
      ["H1", "h1"],
      ["4H", "h4"],
      ["h4", "h4"],
      ["4h", "h4"],
      ["1D", "d1"],
      ["d1", "d1"],
      ["1d", "d1"],
      ["1W", "w1"],
      ["w1", "w1"],
      ["1w", "w1"],
      ["1MN", "mn1"],
      ["mn1", "mn1"],
      ["MN", "mn1"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(normalizeChatTimeframe(input), expected, `${input} -> ${expected}`);
    }
  });

  it("maps unsupported frames to the nearest Companion key", () => {
    assert.equal(normalizeChatTimeframe("2H"), "h1");
    assert.equal(normalizeChatTimeframe("3H"), "h4");
    assert.equal(normalizeChatTimeframe("12H"), "d1");
    assert.equal(normalizeChatTimeframe("2D"), "d1");
    assert.equal(normalizeChatTimeframe("3D"), "w1");
    assert.equal(normalizeChatTimeframe("2W"), "w1");
    assert.equal(normalizeChatTimeframe("3W"), "mn1");
  });

  it("leaves missing tf alone so Companion's own caller is unchanged", () => {
    assert.equal(normalizeChatTimeframe(undefined), undefined);
    assert.equal(normalizeChatTimeframe(""), undefined);
  });
});

describe("normalizeChatSymbol", () => {
  it("strips broker suffixes and maps metals", () => {
    assert.equal(normalizeChatSymbol("EURUSDm"), "EURUSD");
    assert.equal(normalizeChatSymbol("GOLD"), "XAUUSD");
    assert.equal(normalizeChatSymbol("SILVER"), "XAGUSD");
    assert.equal(normalizeChatSymbol("#GOLD"), "XAUUSD");
  });

  it("maps TOS names and ETFs onto Companion display symbols that exist", () => {
    assert.equal(normalizeChatSymbol("NASDAQ 100"), "NAS100");
    assert.equal(normalizeChatSymbol("QQQ"), "NAS100");
    assert.equal(normalizeChatSymbol("SPY"), "SPX500");
    assert.equal(normalizeChatSymbol("DIA"), "US30");
    assert.equal(normalizeChatSymbol("NASDAQ"), "NAS100");
    assert.equal(normalizeChatSymbol("US100"), "NAS100");
  });

  it("keeps canonical Companion names", () => {
    assert.equal(normalizeChatSymbol("XAUUSD"), "XAUUSD");
    assert.equal(normalizeChatSymbol("NAS100"), "NAS100");
    assert.equal(normalizeChatSymbol("SPX500"), "SPX500");
  });

  it("leaves missing symbol alone", () => {
    assert.equal(normalizeChatSymbol(undefined), undefined);
    assert.equal(normalizeChatSymbol(""), undefined);
  });
});

describe("normalizeChatRouteContext", () => {
  it("normalizes the pair TOS actually sends (1H + broker/index names)", () => {
    assert.deepEqual(normalizeChatRouteContext({ symbol: "NASDAQ 100", tf: "1H" }), {
      symbol: "NAS100",
      tf: "h1",
    });
    assert.deepEqual(normalizeChatRouteContext({ symbol: "EURUSDm", tf: "1H" }), {
      symbol: "EURUSD",
      tf: "h1",
    });
    assert.deepEqual(normalizeChatRouteContext({ symbol: "GOLD", tf: "4H" }), {
      symbol: "XAUUSD",
      tf: "h4",
    });
  });
});
