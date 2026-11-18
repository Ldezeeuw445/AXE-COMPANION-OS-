import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alertSymbolsMatch,
  isEvaluablePriceAlert,
  normalizeAlertSymbol,
  planPriceAlertActions,
  readPriceCondition,
  readPriceThreshold,
  shouldFirePriceCross,
  type PriceAlertRow,
} from "./tosPriceAlert.ts";

function row(partial: Partial<PriceAlertRow> = {}): PriceAlertRow {
  return {
    id: "a1",
    user_id: "u1",
    symbol: "XAUUSD",
    type: "price",
    condition: "above",
    threshold: 2700,
    status: "active",
    triggered_at: null,
    account_id: null,
    metadata: {},
    ...partial,
  };
}

describe("normalizeAlertSymbol", () => {
  it("maps TOS names onto Companion display symbols", () => {
    assert.equal(normalizeAlertSymbol("GOLD"), "XAUUSD");
    assert.equal(normalizeAlertSymbol("EURUSDm"), "EURUSD");
    assert.equal(normalizeAlertSymbol("NASDAQ 100"), "NAS100");
    assert.equal(normalizeAlertSymbol("QQQ"), "NAS100");
    assert.equal(normalizeAlertSymbol("SPY"), "SPX500");
    assert.equal(normalizeAlertSymbol("DIA"), "US30");
  });
});

describe("alertSymbolsMatch", () => {
  it("matches GOLD alerts against an XAUUSD snapshot", () => {
    assert.equal(alertSymbolsMatch("GOLD", "XAUUSD"), true);
    assert.equal(alertSymbolsMatch("QQQ", "NAS100"), true);
    assert.equal(alertSymbolsMatch("EURUSD", "GBPUSD"), false);
  });
});

describe("readPriceThreshold / readPriceCondition", () => {
  it("reads threshold from the column, or metadata.price, without requiring Companion fields", () => {
    assert.equal(readPriceThreshold(row()), 2700);
    assert.equal(
      readPriceThreshold(row({ threshold: null, metadata: { price: 1.085 } })),
      1.085,
    );
    assert.equal(readPriceThreshold(row({ threshold: null, metadata: {} })), null);
  });

  it("accepts above/below from the column or metadata", () => {
    assert.equal(readPriceCondition(row()), "above");
    assert.equal(
      readPriceCondition(row({ condition: null, metadata: { condition: "below" } })),
      "below",
    );
    assert.equal(readPriceCondition(row({ condition: "gte" })), "above");
    assert.equal(readPriceCondition(row({ condition: null, metadata: {} })), null);
  });
});

describe("isEvaluablePriceAlert", () => {
  it("accepts a TOS price row with no Companion-only metadata", () => {
    assert.equal(isEvaluablePriceAlert(row({ metadata: {} })), true);
    assert.equal(
      isEvaluablePriceAlert(
        row({ symbol: "GOLD", metadata: { source_app: "trading-os" } }),
      ),
      true,
    );
  });

  it("skips smart templates that have no numeric level", () => {
    assert.equal(
      isEvaluablePriceAlert(
        row({
          threshold: null,
          metadata: { evaluator: "smart", smartKind: "predictive" },
        }),
      ),
      false,
    );
  });

  it("skips paused rows and non-price types", () => {
    assert.equal(isEvaluablePriceAlert(row({ status: "paused" })), false);
    assert.equal(isEvaluablePriceAlert(row({ type: "news", threshold: 1 })), false);
  });
});

describe("shouldFirePriceCross", () => {
  it("does not fire on the first sample — that is the baseline", () => {
    assert.equal(
      shouldFirePriceCross({ previousPrice: null, price: 2710, condition: "above", threshold: 2700 }),
      false,
    );
  });

  it("fires on a real upward or downward cross", () => {
    assert.equal(
      shouldFirePriceCross({ previousPrice: 2699, price: 2701, condition: "above", threshold: 2700 }),
      true,
    );
    assert.equal(
      shouldFirePriceCross({ previousPrice: 1.086, price: 1.084, condition: "below", threshold: 1.085 }),
      true,
    );
  });

  it("does not fire when already on the far side without a cross", () => {
    assert.equal(
      shouldFirePriceCross({ previousPrice: 2710, price: 2720, condition: "above", threshold: 2700 }),
      false,
    );
  });
});

describe("planPriceAlertActions", () => {
  it("baselines a TOS GOLD alert against an XAUUSD quote, then fires on the next cross", () => {
    const gold = row({
      symbol: "GOLD",
      threshold: null,
      metadata: { price: 2700, source_app: "trading-os" },
    });
    const first = planPriceAlertActions([gold], { XAUUSD: 2690 });
    assert.equal(first.length, 1);
    assert.equal(first[0].kind, "baseline");

    const armed = row({
      symbol: "GOLD",
      threshold: null,
      metadata: { price: 2700, last_eval_price: 2690, source_app: "trading-os" },
    });
    const second = planPriceAlertActions([armed], { XAUUSD: 2705 });
    assert.equal(second[0]?.kind, "fire");
    if (second[0]?.kind === "fire") {
      assert.match(second[0].message, /XAUUSD above 2700/);
    }
  });

  it("skips alerts with no quote and smart templates without a level", () => {
    const actions = planPriceAlertActions(
      [
        row({ symbol: "EURUSD" }),
        row({
          threshold: null,
          metadata: { evaluator: "smart", smartKind: "predictive" },
        }),
      ],
      { XAUUSD: 2700 },
    );
    assert.deepEqual(actions, []);
  });
});

