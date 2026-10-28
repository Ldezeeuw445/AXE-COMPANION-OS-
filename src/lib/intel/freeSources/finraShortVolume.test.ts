/**
 * INTEL-FREE: FINRA CNMS short-sale volume parser.
 * Run via npm test (node --test + strip-types loader).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  finraCandidateDates,
  finraShortVolumeUrl,
  parseFinraShortVolumeText,
} from "./finraShortVolume.ts";

describe("INTEL-FREE FINRA short volume", () => {
  it("parses CNMS pipe files and ranks by short ratio", () => {
    const sample = [
      "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market",
      "20260703|AAPL|1000000|1000|4000000|Q",
      "20260703|TSLA|2500000|0|5000000|Q",
      "20260703|MSFT|100|0|10000|Q",
    ].join("\n");

    const all = parseFinraShortVolumeText(sample, { limit: 10 });
    assert.equal(all.length, 3);
    assert.equal(all[0].symbol, "TSLA");
    assert.ok(Math.abs(all[0].shortRatio - 0.5) < 1e-9);

    const aapl = parseFinraShortVolumeText(sample, { symbol: "AAPL" });
    assert.equal(aapl.length, 1);
    assert.equal(aapl[0].date, "2026-07-03");
    assert.equal(aapl[0].shortVolume, 1_000_000);
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
