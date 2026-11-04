import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DAILY_LOSS_BUFFER_PCT,
  dayAnchorBase,
  dayResultPctFromEquity,
  evaluateDailyLoss,
  resolveCurrentEquity,
} from "./dailyLoss";

describe("dailyLoss", () => {
  it("blocks when equity is 3.95% down on a 4% limit with 0.5 buffer", () => {
    const d = evaluateDailyLoss({
      startEquity: 200_000,
      currentEquity: 192_100,
      maxDailyLossPct: 4,
      bufferPct: DAILY_LOSS_BUFFER_PCT,
    });
    assert.equal(d.status, "blocked");
    if (d.status !== "blocked") return;
    assert.equal(d.reason, "daily_loss_reached");
    assert.ok(d.dailyLossPct > 3.9 && d.dailyLossPct < 4.0);
  });

  it("blocks realised profit plus a large floating loss (old balance math would allow)", () => {
    // Balance rose on closed winners, but live equity is deep red.
    const start = 100_000;
    const current = 95_000; // -5% equity
    const d = evaluateDailyLoss({
      startEquity: start,
      currentEquity: current,
      maxDailyLossPct: 4,
    });
    assert.equal(d.status, "blocked");
  });

  it("fails closed when the anchor or equity is missing and a limit is set", () => {
    const d = evaluateDailyLoss({
      startEquity: null,
      currentEquity: 100_000,
      maxDailyLossPct: 4,
    });
    assert.equal(d.status, "unknown");
    if (d.status !== "unknown") return;
    assert.equal(d.reason, "daily_loss_unknown");
  });

  it("does not fail closed on missing equity when there is no daily limit", () => {
    const d = evaluateDailyLoss({
      startEquity: null,
      currentEquity: null,
      maxDailyLossPct: null,
    });
    assert.equal(d.status, "ok");
  });

  it("derives equity from balance + floating P&L", () => {
    assert.equal(
      resolveCurrentEquity({ snapshotBalance: 100_000, floatingPnl: -2_500 }),
      97_500,
    );
    assert.equal(
      resolveCurrentEquity({ snapshotEquity: 98_000, snapshotBalance: 100_000, floatingPnl: -9_999 }),
      98_000,
    );
  });

  it("computes signed day result from equity", () => {
    assert.equal(dayResultPctFromEquity(200_000, 192_100), -3.95);
    assert.equal(dayResultPctFromEquity(0, 100), null);
    assert.equal(dayResultPctFromEquity(null, 100), null);
  });

  it("picks the stricter day-anchor base", () => {
    assert.equal(dayAnchorBase(100, 95, "max"), 100);
    assert.equal(dayAnchorBase(100, 105, "max"), 105);
    assert.equal(dayAnchorBase(100, 105, "balance"), 100);
    assert.equal(dayAnchorBase(100, 105, "equity"), 105);
  });
});
