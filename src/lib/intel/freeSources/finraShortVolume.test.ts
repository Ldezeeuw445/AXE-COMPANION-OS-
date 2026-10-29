/**
 * INTEL-FREE: FINRA CNMS short-sale volume parser.
 * Run via npm test (node --test + strip-types loader).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FINRA_TOP_MIN_TOTAL_VOLUME,
  finraCandidateDates,
  finraShortVolumeUrl,
  parseFinraShortVolumeText,
} from "./finraShortVolume.ts";

/** A FINRA-shaped file: header, then symbols in alphabetical order. */
function cnmsFile(rows: Array<[symbol: string, short: number, total: number]>): string {
  return [
    "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market",
    ...rows.map(([s, sv, tv]) => `20261028|${s}|${sv}|0|${tv}|Q`),
  ].join("\n");
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

  it("the edge-function copy carries the same ranking rules", () => {
    // Deno can't import from src/, so intel-proxy keeps its own copy; this is
    // the only thing that notices if the two drift apart.
    const edge = readFileSync(
      new URL("../../../../supabase/functions/intel-proxy/freeSources/finraShortVolume.ts", import.meta.url),
      "utf8",
    );
    assert.match(edge, new RegExp(`FINRA_TOP_MIN_TOTAL_VOLUME = ${FINRA_TOP_MIN_TOTAL_VOLUME.toLocaleString("en-US").replace(/,/g, "_")};`));
    assert.match(edge, /if \(totalVolume < minTotalVolume\) continue;/);
    assert.doesNotMatch(edge, /rows\.length >= limit\) break/);
  });

  it("builds CDN urls for weekday candidates", () => {
    const dates = finraCandidateDates(new Date("2026-07-03T12:00:00Z"), 3);
    assert.equal(dates.length, 3);
    assert.equal(finraShortVolumeUrl(dates[0]), `https://cdn.finra.org/equity/regsho/daily/CNMS${dates[0]}.txt`);
    for (const d of dates) {
      assert.match(d, /^\d{8}$/);
    }
  });
});
