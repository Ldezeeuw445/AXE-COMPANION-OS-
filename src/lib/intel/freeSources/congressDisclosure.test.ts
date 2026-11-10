/**
 * INTEL-FREE: the congressional-disclosure rules the four congress feeds share.
 *
 * The cases below are the transaction types, tickers and dates those feeds
 * actually send — FMP senate (`Sale (Full)`), FMP house (`sale_partial`), the
 * Stock Watchers (`Purchase`, lower-case tickers, `M/D/YYYY`), Quiver and
 * Unusual Whales (`buy`/`sell`). The ones that matter most are the values that
 * are *neither* a buy nor a sell: before this rule existed every mapper in
 * `intel-proxy` resolved them with `isPurchase ? "BUY" : "SELL"`, so an
 * `Exchange` reached the intel view as a senator selling.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/intel/freeSources/congressDisclosure.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  congressTicker,
  congressTradeDate,
  congressTradeDirection,
} from "./congressDisclosure.ts";
import { normalizeDirection } from "../congressTrades.ts";

describe("INTEL-FREE congress disclosure direction", () => {
  it("reads every spelling of a purchase the four feeds use", () => {
    for (const raw of [
      "Purchase",
      "purchase",
      "P",
      "buy",
      "Buy",
      "P-Purchase",
      "Acquisition",
      " purchase ",
    ]) {
      assert.equal(congressTradeDirection(raw), "BUY", `${raw} should be a BUY`);
    }
  });

  it("reads every spelling of a sale, including the partial ones", () => {
    for (const raw of [
      "Sale",
      "Sale (Full)",
      "Sale (Partial)",
      "sale_full",
      "sale_partial",
      "PARTIAL_SALE",
      "S",
      "sell",
      "S-Sale",
      "Disposition",
    ]) {
      assert.equal(congressTradeDirection(raw), "SELL", `${raw} should be a SELL`);
    }
  });

  it("drops the filings that are neither, instead of calling them sales", () => {
    // This is the whole point. Every one of these used to come out as "SELL".
    for (const raw of ["Exchange", "exchange", "Receive", "Gift", "Conversion", "--", "", "   "]) {
      assert.equal(
        congressTradeDirection(raw),
        null,
        `${JSON.stringify(raw)} is not a direction and must not be guessed`,
      );
    }
    assert.equal(congressTradeDirection(null), null);
    assert.equal(congressTradeDirection(undefined), null);
  });

  it("is the same rule the Alpha Vantage cron already applied", () => {
    // congressTrades.ts decided this question first; it now delegates here, so
    // the app and the edge function cannot disagree about one feed's Exchange.
    for (const raw of ["Purchase", "Sale", "Exchange", "P", "S", "", null]) {
      assert.equal(normalizeDirection(raw), congressTradeDirection(raw));
    }
  });
});

describe("INTEL-FREE congress disclosure ticker", () => {
  it("upper-cases so one disclosure from two feeds is one row", () => {
    // House Stock Watcher sends lower case, FMP sends upper, and
    // intel_congress_trades is unique on (politician, ticker, date, type, range).
    assert.equal(congressTicker("aapl"), "AAPL");
    assert.equal(congressTicker(" msft "), "MSFT");
  });

  it("keeps the real symbols that are not plain letters", () => {
    assert.equal(congressTicker("BRK.B"), "BRK.B");
    assert.equal(congressTicker("BF-B"), "BF-B");
  });

  it("drops the placeholders the feeds use for assets with no ticker", () => {
    for (const raw of ["", "  ", "--", "-", "N/A", "NONE", "NULL", "UNKNOWN"]) {
      assert.equal(congressTicker(raw), null, `${JSON.stringify(raw)} is not a ticker`);
    }
    assert.equal(congressTicker(null), null);
  });

  it("refuses an asset description dressed up as a symbol", () => {
    // FMP's mapper used to fall back to assetDescription, which put strings
    // like this into a column the UI renders as a ticker.
    assert.equal(congressTicker("United States Treasury Bills"), null);
    assert.equal(congressTicker("Vanguard Total Stock Market ETF"), null);
    assert.equal(congressTicker("$1,001 - $15,000"), null);
    assert.equal(congressTicker("REALESTATEHOLDING"), null); // over 10 chars
  });

  it("does not reject a symbol just because it reads like a word", () => {
    // A placeholder list that over-reaches starts discarding real names.
    assert.equal(congressTicker("NA"), "NA");
    assert.equal(congressTicker("ALL"), "ALL");
  });
});

describe("INTEL-FREE congress disclosure date", () => {
  it("accepts the ISO the feeds mostly send, with or without a time", () => {
    assert.equal(congressTradeDate("2026-10-15"), "2026-10-15");
    assert.equal(congressTradeDate("2026-10-15T00:00:00Z"), "2026-10-15");
    assert.equal(congressTradeDate(" 2026-01-02 "), "2026-01-02");
  });

  it("accepts the M/D/YYYY House Stock Watcher still emits", () => {
    assert.equal(congressTradeDate("10/4/2026"), "2026-10-04");
    assert.equal(congressTradeDate("01/15/2026"), "2026-01-15");
  });

  it("rejects anything a `date not null` column would reject", () => {
    // persistCongressTrades upserts all 25 rows in one statement and swallows
    // its own error, so one bad date used to lose the whole batch in silence.
    for (const raw of ["", "--", "N/A", "2026-02-30", "13/01/2026", "2026-13-01", "Oct 15 2026"]) {
      assert.equal(congressTradeDate(raw), null, `${JSON.stringify(raw)} is not a date`);
    }
    assert.equal(congressTradeDate(null), null);
  });

  it("keeps a real leap day", () => {
    assert.equal(congressTradeDate("2024-02-29"), "2024-02-29");
    assert.equal(congressTradeDate("2026-02-29"), null);
  });
});
