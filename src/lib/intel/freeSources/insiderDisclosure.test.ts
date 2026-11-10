/**
 * INTEL-FREE: the insider-trade rules both insider feeds share.
 *
 * Unlike the congress rules, these are imported straight from the edge
 * function rather than from a copy in src/: the modules are pure TypeScript
 * with relative imports only, so Node can load what Deno deploys and there is
 * nothing to drift.
 *
 * The FMP rows below are the shapes `insider-trading-latest` and the v4
 * endpoint send; the Form 4 is trimmed from a real EDGAR filing's XML.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/intel/freeSources/insiderDisclosure.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  form4Value,
  insiderTicker,
  insiderTradeDirection,
  insiderTradesForSymbol,
  mergeInsiderTrades,
  parseForm4Trades,
  type InsiderTrade,
} from "../../../../supabase/functions/intel-proxy/freeSources/insiderDisclosure.ts";
import { mapFmpInsiderRow } from "../../../../supabase/functions/intel-proxy/freeSources/fmpInsider.ts";

describe("INTEL-FREE insider trade direction", () => {
  it("reads open-market purchases and sales in every spelling the feeds use", () => {
    for (const raw of ["P-Purchase", "P", "p", "Purchase", "buy"]) {
      assert.equal(insiderTradeDirection(raw), "BUY", raw);
    }
    for (const raw of ["S-Sale", "S-Sale+OE", "S", "Sale", "sell"]) {
      assert.equal(insiderTradeDirection(raw), "SELL", raw);
    }
  });

  it("does not turn grants, exercises, withholding or gifts into trades", () => {
    for (const raw of [
      "A-Award",
      "M-Exempt",
      "F-InKind",
      "G-Gift",
      "D-Return",
      "C-Conversion",
      "X-InTheMoney",
      "J-Other",
      // The acquired/disposed flag on its own. FMP sends it on every row; it is
      // `A` for a stock grant, which the old mapper reported as a BUY.
      "A",
      "D",
      "",
      "--",
    ]) {
      assert.equal(insiderTradeDirection(raw), null, `${raw} is not a market trade`);
    }
    assert.equal(insiderTradeDirection(undefined), null);
  });
});

describe("INTEL-FREE insider tickers", () => {
  it("keeps real symbols, takes the first class of a multi-class issuer", () => {
    assert.equal(insiderTicker("aapl"), "AAPL");
    assert.equal(insiderTicker("BRK.A, BRK.B"), "BRK.A");
  });

  it("drops the placeholders EDGAR and FMP send for a missing symbol", () => {
    for (const raw of ["", "N/A", "none", "--", "United States Treasury Bills"]) {
      assert.equal(insiderTicker(raw), null, raw);
    }
  });
});

describe("INTEL-FREE FMP insider rows", () => {
  const row = {
    symbol: "nvda",
    filingDate: "2026-10-16 18:02:11",
    transactionDate: "2026-10-14",
    reportingName: "Huang Jen Hsun",
    typeOfOwner: "director, officer: President and CEO",
    acquistionOrDisposition: "D",
    transactionType: "S-Sale",
    securitiesOwned: 75_000_000,
    securitiesTransacted: 120_000,
    price: 180.25,
  };

  it("maps a sale with the transacted size, not the holding after it", () => {
    assert.deepEqual(mapFmpInsiderRow(row), {
      ticker: "NVDA",
      insider: "Huang Jen Hsun",
      role: "director, officer: President and CEO",
      type: "SELL",
      shares: 120_000,
      value: 21_630_000,
      date: "2026-10-14",
    });
  });

  it("drops an award even though FMP flags it as acquired", () => {
    assert.equal(
      mapFmpInsiderRow({ ...row, transactionType: "A-Award", acquistionOrDisposition: "A", price: 0 }),
      null,
    );
  });

  it("does not fall back to the acquired/disposed flag when the code is missing", () => {
    assert.equal(
      mapFmpInsiderRow({ ...row, transactionType: undefined, acquistionOrDisposition: "A" }),
      null,
    );
  });

  it("drops rows the table cannot hold rather than losing the whole upsert", () => {
    assert.equal(mapFmpInsiderRow({ ...row, transactionDate: "--", filingDate: undefined }), null);
    assert.equal(mapFmpInsiderRow({ ...row, transactionDate: "2026-02-30" }), null);
    assert.equal(mapFmpInsiderRow({ ...row, symbol: "" }), null);
    assert.equal(
      mapFmpInsiderRow({ ...row, securitiesTransacted: 0, price: 0, value: undefined }),
      null,
    );
  });

  it("falls back to the filing date when the transaction date is missing", () => {
    assert.equal(mapFmpInsiderRow({ ...row, transactionDate: undefined })?.date, "2026-10-16");
  });
});

const FORM_4 = `<?xml version="1.0"?>
<ownershipDocument>
  <periodOfReport>2026-10-15</periodOfReport>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerName>Apple Inc.</issuerName>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerName>Cook Timothy D</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><officerTitle>Chief Executive Officer</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-10-13</value></transactionDate>
      <transactionCoding><transactionCode>M</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>50000</value></transactionShares>
        <transactionPricePerShare><value>0</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-10-13</value></transactionDate>
      <transactionCoding><transactionCode>F</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>20000</value></transactionShares>
        <transactionPricePerShare><value>250.00</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-10-13</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>10000</value></transactionShares>
        <transactionPricePerShare><value>251.10</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-10-13</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>15000</value></transactionShares>
        <transactionPricePerShare><value>252.00</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-10-15</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>5000</value></transactionShares>
        <transactionPricePerShare><value>249.00</value></transactionPricePerShare>
      </transactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

describe("INTEL-FREE SEC EDGAR Form 4", () => {
  it("reads <value>-wrapped and bare tags", () => {
    assert.equal(form4Value(FORM_4, "issuerTradingSymbol"), "AAPL");
    assert.equal(form4Value(FORM_4, "transactionShares"), "50000");
    assert.equal(form4Value(FORM_4, "missingTag"), "");
  });

  it("keeps only the open-market sales, each on its own transaction date", () => {
    const trades = parseForm4Trades(FORM_4);
    assert.deepEqual(
      trades.map((t) => [t.type, t.shares, t.date]),
      [
        ["SELL", 10_000, "2026-10-13"],
        ["SELL", 15_000, "2026-10-13"],
        // Before: every lot took `periodOfReport`, so this one moved two days.
        ["SELL", 5_000, "2026-10-15"],
      ],
    );
    assert.equal(trades[0].role, "Chief Executive Officer");
  });

  it("sums same-day lots instead of keeping the first and dropping the rest", () => {
    const merged = mergeInsiderTrades(parseForm4Trades(FORM_4));
    assert.deepEqual(
      merged.map((t) => [t.date, t.shares, t.value]),
      [
        ["2026-10-13", 25_000, 2_511_000 + 3_780_000],
        ["2026-10-15", 5_000, 1_245_000],
      ],
    );
  });

  it("drops a filing with no trading symbol instead of storing N/A", () => {
    const noSymbol = FORM_4.replace("<issuerTradingSymbol>AAPL</issuerTradingSymbol>", "");
    assert.deepEqual(parseForm4Trades(noSymbol), []);
    const placeholder = FORM_4.replace(">AAPL<", ">N/A<");
    assert.deepEqual(parseForm4Trades(placeholder), []);
  });
});

describe("INTEL-FREE insider symbol filter", () => {
  const t = (ticker: string): InsiderTrade => ({
    ticker,
    insider: "X",
    type: "BUY",
    value: 1,
    date: "2026-10-01",
  });

  it("matches the symbol exactly", () => {
    const trades = [t("F"), t("FB"), t("FCX")];
    assert.deepEqual(insiderTradesForSymbol(trades, "f").map((x) => x.ticker), ["F"]);
    assert.equal(insiderTradesForSymbol(trades).length, 3);
  });
});

describe("INTEL-FREE insider rules ship as the shared-proxy module", () => {
  it("exports Form 4 parse + merge + symbol filter (no companion index.ts after #149)", () => {
    const mod = readFileSync(
      new URL("../../../../supabase/functions/intel-proxy/freeSources/insiderDisclosure.ts", import.meta.url),
      "utf8",
    );
    assert.match(mod, /export function parseForm4Trades/);
    assert.match(mod, /export function mergeInsiderTrades/);
    assert.match(mod, /export function insiderTradesForSymbol/);
    // Prefix matching was the bug: a symbol filter must be exact.
    assert.doesNotMatch(mod, /startsWith\(symbol\)/);
  });
});
