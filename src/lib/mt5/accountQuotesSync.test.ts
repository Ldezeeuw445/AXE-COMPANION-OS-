import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMt5QuotesSyncMeta,
  deriveMt5ActivityQuotesSymbols,
  getMetadataMt5QuotesSymbols,
  mergeBrokerSymbolsIntoSymbolMap,
  MT5_QUOTES_SOURCE,
} from "./accountQuotesSync";

describe("deriveMt5ActivityQuotesSymbols", () => {
  it("keeps broker suffixes and position→order→deal order", () => {
    const symbols = deriveMt5ActivityQuotesSymbols({
      positions: [{ symbol: "XAUUSD.x" }, { symbol: "NAS100.x" }],
      orders: [{ symbol: "AUDCAD.x" }, { symbol: "XAUUSD.x" }],
      deals: [
        { symbol: "BTCUSD.x", time: "2026-10-28T10:00:00.000Z" },
        { symbol: "US30.x", time: "2026-10-29T10:00:00.000Z" },
        { symbol: "XAGUSD.x", time: "2026-10-27T10:00:00.000Z" },
      ],
    });
    assert.deepEqual(symbols, [
      "XAUUSD.x",
      "NAS100.x",
      "AUDCAD.x",
      "US30.x",
      "BTCUSD.x",
      "XAGUSD.x",
    ]);
  });

  it("dedupes case-insensitively but preserves first casing", () => {
    const symbols = deriveMt5ActivityQuotesSymbols({
      positions: [{ symbol: "eurusd.x" }],
      orders: [{ symbol: "EURUSD.x" }],
      deals: [{ symbol: "EurUsd.x" }],
    });
    assert.deepEqual(symbols, ["eurusd.x"]);
  });

  it("respects max and ignores empty rows", () => {
    const symbols = deriveMt5ActivityQuotesSymbols({
      positions: [{ symbol: "A.x" }, { symbol: "" }, null, { symbol: "B.x" }, { symbol: "C.x" }],
      max: 2,
    });
    assert.deepEqual(symbols, ["A.x", "B.x"]);
  });
});

describe("mt5 quotes metadata helpers", () => {
  it("build/read round-trip", () => {
    const meta = buildMt5QuotesSyncMeta(["XAUUSD.x", "BTCUSD.x"], "2026-10-29T12:00:00.000Z");
    assert.equal(meta.mt5_quotes_source, MT5_QUOTES_SOURCE);
    assert.deepEqual(getMetadataMt5QuotesSymbols(meta), ["XAUUSD.x", "BTCUSD.x"]);
  });

  it("mergeBrokerSymbolsIntoSymbolMap maps display and broker keys", () => {
    const map = mergeBrokerSymbolsIntoSymbolMap(
      { EURUSD: "EURUSD.x" },
      ["XAUUSD.x", "NAS100.x"],
      (s) => s.replace(/\.x$/i, "").toUpperCase(),
    );
    assert.equal(map["XAUUSD"], "XAUUSD.x");
    assert.equal(map["XAUUSD.X"], "XAUUSD.x");
    assert.equal(map["NAS100"], "NAS100.x");
    assert.equal(map["EURUSD"], "EURUSD.x");
  });
});
