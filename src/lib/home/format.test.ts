import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatClockTime,
  formatMoney,
  formatPct,
  formatPrice,
  pnlTone,
  relativeTime,
  shortAddress,
  sideKind,
  sideLabel,
} from "./format";

describe("home format", () => {
  it("formats money, percent and missing values", () => {
    assert.equal(formatMoney(null), "—");
    assert.equal(formatMoney(112731.5), "$112,731.50");
    assert.equal(formatMoney(335.5, { sign: true }), "+$335.50");
    assert.equal(formatMoney(-52.08, { sign: true }), "−$52.08");
    assert.equal(formatPct(2.5), "+2.50%");
    assert.equal(formatPct(-0.61), "−0.61%");
    assert.equal(formatPct(null), "—");
  });

  it("picks price digits from magnitude", () => {
    assert.equal(formatPrice(2811.24), "2,811.24");
    assert.match(formatPrice(1.0571), /^1\.0571/);
    assert.equal(formatPrice(null), "—");
  });

  it("maps side and tone", () => {
    assert.equal(sideKind("buy"), "buy");
    assert.equal(sideKind("SHORT"), "sell");
    assert.equal(sideKind("buy_limit"), "buy");
    assert.equal(sideLabel("buy"), "Buy");
    assert.equal(sideLabel("sell", "sell_limit"), "Limit");
    assert.equal(pnlTone(12), "up");
    assert.equal(pnlTone(-1), "dn");
    assert.equal(pnlTone(0), "mut");
  });

  it("shortens addresses and relative times", () => {
    assert.equal(shortAddress("0x1234567890abcdef"), "0x12…cdef");
    assert.equal(relativeTime(new Date(Date.now() - 10_000).toISOString()), "now");
    assert.equal(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString()), "5m");
    assert.equal(formatClockTime("2026-11-26T12:18:00.000Z").includes(":"), true);
  });
});
