/**
 * INTEL-FREE: the three congress mappers that used to be untestable.
 *
 * They lived inline in `supabase/functions/intel-proxy/index.ts` — Deno, remote
 * URL imports, outside `tsconfig.json`'s `include` — so `npm run typecheck`
 * never saw them and `npm test` could not import them. Each row below is a
 * response shape the real feed sends, including the ones that must not become a
 * row at all.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/intel/freeSources/congressFeeds.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  dedupeCongressTrades,
  mapQuiverCongressRow,
  mapStockWatcherRow,
  mapUnusualWhalesCongressRow,
  type CongressFeedTrade,
} from "./congressFeeds.ts";

describe("INTEL-FREE Unusual Whales congress rows", () => {
  it("maps a recent-trades row", () => {
    assert.deepEqual(
      mapUnusualWhalesCongressRow({
        politician: "Nancy Pelosi",
        chamber: "House",
        ticker: "nvda",
        transaction_type: "Buy",
        amount: "$1,000,001 - $5,000,000",
        transaction_date: "2026-10-14",
      }),
      {
        politician: "Nancy Pelosi",
        chamber: "House",
        ticker: "NVDA",
        direction: "BUY",
        size: "$1,000,001 - $5,000,000",
        date: "2026-10-14",
      },
    );
  });

  it("drops an exchange rather than reporting it as a sale", () => {
    assert.equal(
      mapUnusualWhalesCongressRow({
        politician: "A Senator",
        chamber: "Senate",
        ticker: "AAPL",
        transaction_type: "Exchange",
        transaction_date: "2026-10-14",
      }),
      null,
    );
  });

  it("falls back through the field names the response actually varies", () => {
    const t = mapUnusualWhalesCongressRow({
      name: "B Representative",
      party: "Democrat",
      asset_ticker: "MSFT",
      trade_type: "sell",
      filed_date: "2026-09-30",
    });
    assert.equal(t?.politician, "B Representative");
    // No chamber and no house: `party` is what is left, poor as it is.
    assert.equal(t?.chamber, "Democrat");
    assert.equal(t?.ticker, "MSFT");
    assert.equal(t?.direction, "SELL");
    assert.equal(t?.size, "N/A");
    assert.equal(t?.date, "2026-09-30");
  });

  it("names an unknown filer rather than dropping a real trade", () => {
    const t = mapUnusualWhalesCongressRow({
      ticker: "TSLA",
      type: "Purchase",
      date: "2026-08-01",
    });
    assert.equal(t?.politician, "Unknown");
    assert.equal(t?.chamber, "Congress");
  });
});

describe("INTEL-FREE Quiver congress rows", () => {
  it("reads the capitalised bulk shape", () => {
    assert.deepEqual(
      mapQuiverCongressRow({
        Representative: "Ro Khanna",
        House: "Representatives",
        Ticker: "AMZN",
        Transaction: "Purchase",
        Range: "$15,001 - $50,000",
        TransactionDate: "2026-07-21",
      }),
      {
        politician: "Ro Khanna",
        chamber: "Representatives",
        ticker: "AMZN",
        direction: "BUY",
        size: "$15,001 - $50,000",
        date: "2026-07-21",
      },
    );
  });

  it("reads the lower-case legacy live shape", () => {
    const t = mapQuiverCongressRow({
      representative: "Ro Khanna",
      chamber: "House",
      ticker: "amzn",
      transaction: "Sale (Partial)",
      amount: "$1,001 - $15,000",
      transaction_date: "2026-07-21",
    });
    assert.equal(t?.ticker, "AMZN");
    assert.equal(t?.direction, "SELL");
  });

  it("drops a row whose asset has no ticker", () => {
    assert.equal(
      mapQuiverCongressRow({
        Representative: "Someone",
        Ticker: "--",
        Transaction: "Purchase",
        TransactionDate: "2026-07-21",
      }),
      null,
    );
  });
});

describe("INTEL-FREE Stock Watcher congress rows", () => {
  it("takes the chamber from the endpoint, not from the row", () => {
    // Both feeds send the same shape; only the URL says which chamber it is.
    const senate = mapStockWatcherRow(
      {
        senator: "Thomas R. Carper",
        ticker: "ibm",
        type: "Purchase",
        amount_range: "$1,001 - $15,000",
        transaction_date: "2026-05-04",
      },
      "Senate",
    );
    assert.equal(senate?.chamber, "Senate");
    assert.equal(senate?.politician, "Thomas R. Carper");
    assert.equal(senate?.ticker, "IBM");

    const house = mapStockWatcherRow(
      { representative: "Hon. Someone", ticker: "IBM", type: "sale_full", transaction_date: "2026-05-04" },
      "House",
    );
    assert.equal(house?.chamber, "House");
    assert.equal(house?.direction, "SELL");
  });

  it("accepts the M/D/YYYY dates House Stock Watcher still emits", () => {
    const t = mapStockWatcherRow(
      { representative: "Hon. Someone", ticker: "GOOG", type: "purchase", transaction_date: "10/4/2026" },
      "House",
    );
    assert.equal(t?.date, "2026-10-04");
  });

  it("drops the rows a `date not null` column would have rejected", () => {
    for (const transaction_date of ["--", "", "N/A"]) {
      assert.equal(
        mapStockWatcherRow({ representative: "X", ticker: "GOOG", type: "purchase", transaction_date }, "House"),
        null,
        `${JSON.stringify(transaction_date)} should not reach the upsert`,
      );
    }
  });

  it("drops the non-ticker assets these feeds are full of", () => {
    // Treasuries, funds and property are disclosed too, with no symbol.
    for (const ticker of ["--", "", "N/A", "Corporate Bond, Series B"]) {
      assert.equal(
        mapStockWatcherRow({ representative: "X", ticker, type: "purchase", transaction_date: "2026-05-04" }, "House"),
        null,
        `${JSON.stringify(ticker)} is not a symbol`,
      );
    }
  });
});

describe("INTEL-FREE congress dedupe", () => {
  const trade = (over: Partial<CongressFeedTrade> = {}): CongressFeedTrade => ({
    politician: "Nancy Pelosi",
    chamber: "House",
    ticker: "NVDA",
    direction: "BUY",
    size: "$1,001 - $15,000",
    date: "2026-10-14",
    ...over,
  });

  it("collapses the same filing arriving from two feeds", () => {
    const out = dedupeCongressTrades([trade(), trade({ chamber: "Representatives" })]);
    assert.equal(out.length, 1);
  });

  it("keeps two filings that differ only by amount band", () => {
    // The old key omitted the band, so this second real disclosure was lost.
    // The unique index on intel_congress_trades includes it.
    const out = dedupeCongressTrades([trade(), trade({ size: "$50,001 - $100,000" })]);
    assert.equal(out.length, 2);
  });

  it("sorts newest first before cutting to the limit", () => {
    // Dedupe used to run before the sort, so the limit kept arbitrary rows.
    const out = dedupeCongressTrades(
      [
        trade({ date: "2026-01-05", ticker: "AAA" }),
        trade({ date: "2026-10-14", ticker: "BBB" }),
        trade({ date: "2026-06-02", ticker: "CCC" }),
      ],
      2,
    );
    assert.deepEqual(out.map((t) => t.ticker), ["BBB", "CCC"]);
  });
});

describe("INTEL-FREE congress feeds, edge-function copy", () => {
  it("is byte-identical to this one from the first export down", () => {
    // Deno can't import from src/, so intel-proxy keeps its own copy. Both
    // files declare that everything from the first export down is the same —
    // only the header and the import's file extension differ — so compare
    // exactly rather than by sampled regex.
    const read = (url: URL) => readFileSync(url, "utf8");
    // Anchored to the start of a line: both headers name the marker in prose.
    const MARKER = /^export type CongressFeedTrade/m;
    const body = (src: string) => {
      const at = MARKER.exec(src)?.index;
      assert.ok(at !== undefined, `expected ${MARKER} to split header from body`);
      return src.slice(at);
    };

    assert.equal(
      body(read(new URL("../../../../supabase/functions/intel-proxy/freeSources/congressFeeds.ts", import.meta.url))),
      body(read(new URL("./congressFeeds.ts", import.meta.url))),
    );
  });

  it("is what index.ts actually calls, with no mapping left inline", () => {
    const proxy = readFileSync(
      new URL("../../../../supabase/functions/intel-proxy/index.ts", import.meta.url),
      "utf8",
    );
    for (const fn of [
      "mapUnusualWhalesCongressRow",
      "mapQuiverCongressRow",
      "mapStockWatcherRow",
      "dedupeCongressTrades",
    ]) {
      assert.match(proxy, new RegExp(`${fn}\\(`), `index.ts should call ${fn}`);
    }
    // The bug this replaced: a direction resolved by ternary instead of by rule.
    assert.doesNotMatch(proxy, /isPurchase/);
  });
});
