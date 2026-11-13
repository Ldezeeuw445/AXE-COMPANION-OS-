import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectConcentration, isLong, newYorkClock, normalize, weekendExposureWarning } from "./positionRisk";

describe("positionRisk", () => {
  it("reads MetaApi position types as the right side", () => {
    assert.equal(isLong("POSITION_TYPE_BUY"), true);
    assert.equal(isLong("POSITION_TYPE_SELL"), false);
    assert.equal(isLong("buy"), true);
    assert.equal(isLong("sell"), false);
    assert.equal(isLong("long"), true);
    assert.equal(isLong(0), true);
    assert.equal(isLong(1), false);
  });

  it("does not call an MT5 hedge (one buy, one sell) a same-side stack", () => {
    const f = detectConcentration([
      { symbol: "EURUSD", side: "POSITION_TYPE_BUY", volume: 1 },
      { symbol: "EURUSD", side: "POSITION_TYPE_SELL", volume: 1 },
    ]);
    assert.equal(f.filter((x) => x.id === "same_symbol").length, 0);
  });

  it("labels two MT5 longs as long, not short", () => {
    const f = detectConcentration([
      { symbol: "XAUUSD", side: "POSITION_TYPE_BUY", volume: 0.5 },
      { symbol: "XAUUSD.r", side: "POSITION_TYPE_BUY", volume: 0.5 },
    ]);
    assert.match(f[0].title, /all long/);
  });

  it("normalises broker suffixes on indices and FX", () => {
    assert.equal(normalize("US30cash"), "US30");
    assert.equal(normalize("NAS100CASH"), "NAS100");
    assert.equal(normalize("XAUUSDm"), "XAUUSD");
    assert.equal(normalize("EURUSD.r"), "EURUSD");
    assert.equal(normalize("US30"), "US30");
    assert.equal(normalize("GER40"), "GER40");
  });

  it("sees US30cash and NAS100cash longs as one index stack", () => {
    const f = detectConcentration([
      { symbol: "US30cash", side: "buy", volume: 1 },
      { symbol: "NAS100cash", side: "buy", volume: 1 },
    ]);
    assert.ok(f.some((x) => x.id === "index_stack"));
  });

  it("follows New York DST for the Friday close", () => {
    // 13 Nov 2026 (winter): close 22:00 UTC. 21:30 UTC is the last hour.
    assert.deepEqual(newYorkClock(new Date("2026-11-13T21:30:00Z")), { weekday: 5, hour: 16 });
    const winter = weekendExposureWarning(new Date("2026-11-13T21:30:00Z"), 2, false);
    assert.ok(winter);
    assert.match(winter.body, /about 1h/);
    assert.equal(weekendExposureWarning(new Date("2026-11-13T18:30:00Z"), 2, false), null);
    // 12 Jun 2026 (summer): close 21:00 UTC.
    assert.ok(weekendExposureWarning(new Date("2026-06-12T18:30:00Z"), 1, true));
    assert.equal(weekendExposureWarning(new Date("2026-06-12T21:10:00Z"), 1, true), null);
  });

  it("stays quiet with no open positions or on another day", () => {
    assert.equal(weekendExposureWarning(new Date("2026-11-13T21:30:00Z"), 0, false), null);
    assert.equal(weekendExposureWarning(new Date("2026-11-12T21:30:00Z"), 2, false), null);
  });
});
