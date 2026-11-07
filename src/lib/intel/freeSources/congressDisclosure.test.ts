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
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  congressTicker,
  congressTradeDate,
  congressTradeDirection,
} from "./congressDisclosure.ts";
import { normalizeDirection } from "../congressTrades.ts";

/**
 * Source with its comments removed, so an assertion about the code is not
 * satisfied — or broken — by a comment that quotes the code.
 *
 * `//` is only treated as a comment when it does not follow a `:`, which keeps
 * the `https://` in these files intact.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

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

describe("INTEL-FREE congress disclosure, edge-function copy", () => {
  it("carries the same rules as this one", () => {
    // Deno can't import from src/, so intel-proxy keeps its own copy. This is
    // the only thing that notices if the two drift apart.
    const edge = readFileSync(
      new URL(
        "../../../../supabase/functions/intel-proxy/freeSources/congressDisclosure.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const mine = readFileSync(new URL("./congressDisclosure.ts", import.meta.url), "utf8");

    // The three bodies, compared on the lines that make the decisions.
    const rules = [
      /if \(v === "P"\) return "BUY";/,
      /if \(v === "S"\) return "SELL";/,
      /v\.includes\("PURCHASE"\) \|\| v\.includes\("BUY"\) \|\| v\.includes\("ACQUISITION"\)/,
      /v\.includes\("SALE"\) \|\| v\.includes\("SELL"\) \|\| v\.includes\("DISPOSITION"\)/,
      /return TICKER_SHAPE\.test\(v\) \? v : null;/,
      /\^\[A-Z\]\[A-Z0-9\.\\-\]\{0,9\}\$/,
    ];
    for (const rule of rules) {
      assert.match(edge, rule, `edge copy is missing: ${rule}`);
      assert.match(mine, rule, `tested copy is missing: ${rule}`);
    }

    // The placeholder set has to match exactly: a symbol one copy drops and the
    // other keeps is a duplicate row in intel_congress_trades.
    const placeholders = (src: string) =>
      /const TICKER_PLACEHOLDERS = new Set\(\[([\s\S]*?)\]\);/
        .exec(src)?.[1]
        .match(/"[^"]*"/g)
        ?.sort();
    const edgeSet = placeholders(edge);
    assert.ok(edgeSet && edgeSet.length > 0, "edge copy has no placeholder set");
    assert.deepEqual(edgeSet, placeholders(mine));
  });

  it("is actually used by every congress mapper in intel-proxy", () => {
    // Four feeds reach intel_congress_trades, across two mapper files. A fifth
    // added with its own ternary would be invisible to the tests above, so the
    // ternary itself is what gets asserted gone — in the code, not in the
    // comments, which quote it on purpose to say what went wrong.
    const proxyDir = new URL("../../../../supabase/functions/intel-proxy/", import.meta.url);
    const read = (file: string) => codeOnly(readFileSync(new URL(file, proxyDir), "utf8"));

    for (const file of ["freeSources/fmpCongress.ts", "freeSources/congressFeeds.ts"]) {
      const src = read(file);
      assert.doesNotMatch(
        src,
        /isPurchase/,
        `${file} still decides a direction with a ternary instead of congressTradeDirection`,
      );
      assert.match(
        src,
        /congressTradeDirection\(/,
        `${file} should use the shared direction rule`,
      );
    }
    // index.ts no longer maps rows at all; congressFeeds.test.ts holds it to that.
    assert.doesNotMatch(read("index.ts"), /isPurchase/);
  });
});
