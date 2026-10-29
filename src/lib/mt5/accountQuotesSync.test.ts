import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMt5QuotesSyncMeta,
  getMetadataMt5QuotesSymbols,
  getMetadataMt5QuotesUnavailable,
  mapWatchlistToAccountQuotes,
  mergeMappedQuotesIntoSymbolMap,
  MT5_QUOTES_SOURCE,
  normalizeWatchlistSymbols,
} from "./accountQuotesSync";

describe("normalizeWatchlistSymbols", () => {
  it("dedupes and cleans, preserving order", () => {
    assert.deepEqual(
      normalizeWatchlistSymbols(["xauusd.x", "XAUUSD", "NAS100", "BTCUSD"]),
      ["XAUUSD", "NAS100", "BTCUSD"],
    );
  });
});

describe("mapWatchlistToAccountQuotes", () => {
  it("prefers exact symbol_map hits and preserves watchlist order", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD", "NAS100", "BTCUSD", "AUDCAD"],
      {
        XAUUSD: "XAUUSD.x",
        NAS100: "NAS100.x",
        BTCUSD: "BTCUSD.x",
        AUDCAD: "AUDCAD.x",
      },
      ["XAUUSD.x", "NAS100.x", "BTCUSD.x", "AUDCAD.x", "EURUSD.x"],
    );
    assert.deepEqual(
      mapping.available.map((r) => r.broker),
      ["XAUUSD.x", "NAS100.x", "BTCUSD.x", "AUDCAD.x"],
    );
    assert.deepEqual(mapping.unavailable, []);
  });

  it("resolves suffix variants from the broker universe when map misses", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD", "EURUSD"],
      {},
      ["XAUUSD.pro", "EURUSDm", "GBPUSD.pro"],
    );
    assert.equal(mapping.available[0]?.canonical, "XAUUSD");
    assert.equal(mapping.available[0]?.broker, "XAUUSD.pro");
    assert.equal(mapping.available[1]?.canonical, "EURUSD");
    assert.equal(mapping.available[1]?.broker, "EURUSDm");
    assert.deepEqual(mapping.unavailable, []);
  });

  it("resolves common aliases (GOLD, US100, DJ30)", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD", "NAS100", "US30"],
      {},
      ["GOLD", "US100.x", "DJ30", "EURUSD"],
    );
    assert.equal(mapping.available.find((r) => r.canonical === "XAUUSD")?.broker, "GOLD");
    assert.equal(mapping.available.find((r) => r.canonical === "NAS100")?.broker, "US100.x");
    assert.equal(mapping.available.find((r) => r.canonical === "US30")?.broker, "DJ30");
  });

  it("lists missing symbols as unavailable and omits them from available", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD", "PLTR", "BTCUSD"],
      { XAUUSD: "XAUUSD.x" },
      ["XAUUSD.x", "EURUSD.x"],
    );
    assert.deepEqual(
      mapping.available.map((r) => r.canonical),
      ["XAUUSD"],
    );
    assert.deepEqual(mapping.unavailable.sort(), ["BTCUSD", "PLTR"]);
  });

  it("keeps mapped rows when universe is still empty (warming)", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD", "NAS100"],
      { XAUUSD: "XAUUSD.x" },
      [],
    );
    assert.deepEqual(mapping.available, [{ canonical: "XAUUSD", broker: "XAUUSD.x" }]);
    assert.deepEqual(mapping.unavailable, ["NAS100"]);
  });

  it("evicts stale map entries that are no longer in the universe", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD"],
      { XAUUSD: "XAUUSD.old" },
      ["XAUUSD.x"],
    );
    assert.equal(mapping.available[0]?.broker, "XAUUSD.x");
    assert.deepEqual(mapping.unavailable, []);
  });
});

describe("mt5 quotes metadata helpers", () => {
  it("build/read round-trip including unavailable", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD", "PLTR"],
      { XAUUSD: "XAUUSD.x" },
      ["XAUUSD.x"],
    );
    const meta = buildMt5QuotesSyncMeta(mapping, "2026-10-29T12:00:00.000Z");
    assert.equal(meta.mt5_quotes_source, MT5_QUOTES_SOURCE);
    assert.deepEqual(getMetadataMt5QuotesSymbols(meta), ["XAUUSD.x"]);
    assert.deepEqual(getMetadataMt5QuotesUnavailable(meta), ["PLTR"]);
  });

  it("mergeMappedQuotesIntoSymbolMap writes canonical and broker keys", () => {
    const mapping = mapWatchlistToAccountQuotes(
      ["XAUUSD", "NAS100"],
      {},
      ["XAUUSD.x", "NAS100.x"],
    );
    const map = mergeMappedQuotesIntoSymbolMap({ EURUSD: "EURUSD.x" }, mapping);
    assert.equal(map["XAUUSD"], "XAUUSD.x");
    assert.equal(map["XAUUSD.X"], "XAUUSD.x");
    assert.equal(map["NAS100"], "NAS100.x");
    assert.equal(map["EURUSD"], "EURUSD.x");
  });
});
