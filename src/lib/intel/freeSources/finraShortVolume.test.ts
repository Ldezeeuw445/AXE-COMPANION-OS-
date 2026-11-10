/**
 * INTEL-FREE: FINRA CNMS short-sale volume.
 *
 * Imported straight from the edge function, like the insider rules: the module
 * is pure TypeScript with relative imports only, so Node loads what Deno
 * deploys and there is no copy in src/ to drift.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/intel/freeSources/finraShortVolume.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FINRA_TOP_MIN_LIST_ROWS,
  FINRA_TOP_MIN_TOTAL_VOLUME,
  fetchFinraShortVolume,
  finraCandidateDates,
  finraShortVolumeUrl,
  parseFinraShortVolumeText,
  shortVolumeTopFromStored,
  type FreeShortVolume,
} from "../../../../supabase/functions/intel-proxy/freeSources/finraShortVolume.ts";

/** A FINRA-shaped file: header, then symbols in alphabetical order. */
function cnmsFile(rows: Array<[symbol: string, short: number, total: number]>): string {
  return [
    "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market",
    ...rows.map(([s, sv, tv]) => `20261028|${s}|${sv}|0|${tv}|Q`),
  ].join("\n");
}

function stored(symbol: string, date: string, short: number, total: number): FreeShortVolume {
  return {
    symbol,
    date,
    shortVolume: short,
    shortExemptVolume: 0,
    totalVolume: total,
    shortRatio: short / total,
    market: "Q",
  };
}

/** A market-wide list as a FINRA fetch would have stored it for `date`. */
function storedList(date: string, count: number, ratio = 0.3): FreeShortVolume[] {
  return Array.from({ length: count }, (_, i) =>
    stored(`L${String(i).padStart(3, "0")}`, date, Math.round(1_000_000 * ratio), 1_000_000),
  );
}

describe("INTEL-FREE FINRA short volume", () => {
  it("parses CNMS pipe files and ranks by short ratio", () => {
    const sample = [
      "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market",
      "20260703|AAPL|1000000|1000|4000000|Q",
      "20260703|TSLA|2500000|0|5000000|Q",
      "20260703|MSFT|100|0|10000|Q",
    ].join("\n");

    const all = parseFinraShortVolumeText(sample, { limit: 10, minTotalVolume: 0 });
    assert.equal(all.length, 3);
    assert.equal(all[0].symbol, "TSLA");
    assert.ok(Math.abs(all[0].shortRatio - 0.5) < 1e-9);

    const aapl = parseFinraShortVolumeText(sample, { symbol: "AAPL" });
    assert.equal(aapl.length, 1);
    assert.equal(aapl[0].date, "2026-07-03");
    assert.equal(aapl[0].shortVolume, 1_000_000);
  });

  it("ranks the whole file, not just the first `limit` alphabetical rows", () => {
    // 60 names at 10% short, then the real leader last — where "Z" sorts.
    const rows: Array<[string, number, number]> = [];
    for (let i = 0; i < 60; i++) rows.push([`A${String(i).padStart(3, "0")}`, 100_000, 1_000_000]);
    rows.push(["ZZZ", 900_000, 1_000_000]);

    const top = parseFinraShortVolumeText(cnmsFile(rows), { limit: 40 });
    assert.equal(top.length, 40);
    assert.equal(top[0].symbol, "ZZZ");
  });

  it("keeps thin names out of the market-wide list but not out of a lookup", () => {
    const file = cnmsFile([
      ["AAPL", 2_000_000, 5_000_000],
      ["TINY", 200, 200],
    ]);

    const top = parseFinraShortVolumeText(file);
    assert.deepEqual(top.map((r) => r.symbol), ["AAPL"]);
    assert.ok(200 < FINRA_TOP_MIN_TOTAL_VOLUME);

    const tiny = parseFinraShortVolumeText(file, { symbol: "tiny" });
    assert.equal(tiny.length, 1);
    assert.equal(tiny[0].shortRatio, 1);
  });

  it("drops rows whose date isn't a real day instead of storing them", () => {
    // trade_date is `date not null` and the upsert is one statement: one row
    // like these would make Postgres reject the whole batch.
    const file = [
      "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market",
      "20261028|AAPL|2000000|0|5000000|Q",
      "20261399|BAD1|2000000|0|5000000|Q",
      "--|BAD2|2000000|0|5000000|Q",
      "20260230|BAD3|2000000|0|5000000|Q",
      "2026-10-28|MSFT|1000000|0|5000000|Q",
    ].join("\n");

    const rows = parseFinraShortVolumeText(file);
    assert.deepEqual(rows.map((r) => r.symbol), ["AAPL", "MSFT"]);
    assert.ok(rows.every((r) => r.date === "2026-10-28"));
  });

  it("skips a trailing record count and short lines", () => {
    const file = `${cnmsFile([["AAPL", 2_000_000, 5_000_000]])}\n9876\n20261028|ONLY|3\n`;
    assert.deepEqual(parseFinraShortVolumeText(file).map((r) => r.symbol), ["AAPL"]);
  });

  it("builds CDN urls for weekday candidates", () => {
    // 2026-07-06 is a Monday: the weekend before it must be skipped.
    const dates = finraCandidateDates(new Date("2026-07-06T12:00:00Z"), 3);
    assert.deepEqual(dates, ["20260706", "20260703", "20260702"]);
    assert.equal(finraShortVolumeUrl(dates[0]), "https://cdn.finra.org/equity/regsho/daily/CNMS20260706.txt");
  });
});

describe("INTEL-FREE FINRA market-wide list from storage", () => {
  it("serves one trade date, not a mix of every day ever fetched", () => {
    const rows = [
      ...storedList("2026-10-27", 30, 0.9), // older day, higher ratios
      ...storedList("2026-10-28", 30, 0.3),
    ];
    const top = shortVolumeTopFromStored(rows);
    assert.equal(top.length, 30);
    assert.ok(top.every((r) => r.date === "2026-10-28"));
  });

  it("does not let a newer single-symbol lookup replace the list", () => {
    // Someone looked up NVDA on the 29th; the newest full list is the 28th.
    const rows = [
      stored("NVDA", "2026-10-29", 3_000_000, 6_000_000),
      ...storedList("2026-10-28", FINRA_TOP_MIN_LIST_ROWS),
    ];
    const top = shortVolumeTopFromStored(rows);
    assert.equal(top.length, FINRA_TOP_MIN_LIST_ROWS);
    assert.ok(top.every((r) => r.date === "2026-10-28"));
  });

  it("keeps a thin name someone looked up out of the ranking", () => {
    const rows = [stored("TINY", "2026-10-28", 200, 200), ...storedList("2026-10-28", 12)];
    const top = shortVolumeTopFromStored(rows);
    assert.ok(!top.some((r) => r.symbol === "TINY"));
    assert.equal(top.length, 12);
  });

  it("ranks by short ratio and caps at the limit", () => {
    const rows = [
      ...storedList("2026-10-28", 50, 0.2),
      stored("LEAD", "2026-10-28", 800_000, 1_000_000),
    ];
    const top = shortVolumeTopFromStored(rows, 40);
    assert.equal(top.length, 40);
    assert.equal(top[0].symbol, "LEAD");
  });

  it("falls back to the newest day when no day holds a full list", () => {
    const rows = [
      stored("AAPL", "2026-10-28", 2_000_000, 5_000_000),
      stored("MSFT", "2026-10-27", 2_000_000, 5_000_000),
    ];
    assert.deepEqual(shortVolumeTopFromStored(rows).map((r) => r.symbol), ["AAPL"]);
    assert.deepEqual(shortVolumeTopFromStored([]), []);
  });
});

describe("INTEL-FREE FINRA fetch", () => {
  function fakeFetch(byUrl: Record<string, () => Response>) {
    const seen: string[] = [];
    const fn = async (url: string) => {
      seen.push(url);
      const make = byUrl[url];
      return make ? make() : new Response("", { status: 404 });
    };
    return { fn, seen };
  }

  it("walks back past unpublished days to the newest file", async () => {
    const [, second] = finraCandidateDates(new Date(), 2);
    const { fn, seen } = fakeFetch({
      [finraShortVolumeUrl(second)]: () =>
        new Response(cnmsFile([["AAPL", 2_000_000, 5_000_000]]), { status: 200 }),
    });
    const rows = await fetchFinraShortVolume(fn);
    assert.deepEqual(rows.map((r) => r.symbol), ["AAPL"]);
    assert.equal(seen.length, 2);
  });

  it("reports why it failed instead of returning an empty list", async () => {
    const { fn, seen } = fakeFetch({});
    await assert.rejects(fetchFinraShortVolume(fn), /^Error: finra_not_published_\d{8}$/);
    assert.equal(seen.length, 6);

    const down = async () => new Response("", { status: 503 });
    await assert.rejects(fetchFinraShortVolume(down), /finra_http_503/);
  });

  it("names the missing symbol when no recent file has it", async () => {
    const ok = async () => new Response(cnmsFile([["AAPL", 2_000_000, 5_000_000]]), { status: 200 });
    await assert.rejects(fetchFinraShortVolume(ok, "ZZZZ"), /finra_symbol_missing_ZZZZ/);
  });
});

describe("INTEL-FREE FINRA module ships the list-rebuild rules", () => {
  // Companion no longer owns intel-proxy/index.ts (#149). The shared proxy in
  // trading-os-app must call these; the module itself is what we can assert here.
  const mod = readFileSync(
    new URL("../../../../supabase/functions/intel-proxy/freeSources/finraShortVolume.ts", import.meta.url),
    "utf8",
  );

  it("exports shortVolumeTopFromStored with the volume floor", () => {
    assert.match(mod, /export function shortVolumeTopFromStored/);
    assert.match(mod, /FINRA_TOP_MIN_TOTAL_VOLUME/);
    assert.match(mod, /FINRA_TOP_MIN_LIST_ROWS/);
  });

  it("drops invalid trade dates before any upsert", () => {
    // Same date gate as congress disclosures — one bad date fails the whole upsert.
    assert.match(mod, /congressTradeDate/);
  });
});
