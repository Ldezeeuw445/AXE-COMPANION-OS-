import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarMonthPnl,
  equityPolyline,
  matchesHomeFilter,
  openPnlSum,
  openRiskToStops,
  performanceStats,
} from "./homeStats";

describe("homeStats", () => {
  it("filters by account and pair, treating * as all pairs", () => {
    assert.equal(matchesHomeFilter({ accountId: "a", symbol: "XAUUSD" }, "all", "ALL"), true);
    assert.equal(matchesHomeFilter({ accountId: "a", symbol: "XAUUSD" }, "b", "ALL"), false);
    assert.equal(matchesHomeFilter({ accountId: "a", symbol: "EURUSD" }, "a", "XAUUSD"), false);
    assert.equal(matchesHomeFilter({ accountId: "a", symbols: ["*"] }, "a", "XAUUSD"), true);
    assert.equal(matchesHomeFilter({ symbols: ["EURUSD"] }, "all", "XAUUSD"), false);
  });

  it("sums open P/L and skips pending tickets", () => {
    assert.equal(
      openPnlSum([
        { pnl: 12, side: "buy" },
        { pnl: -3, side: "sell" },
        { pnl: 99, side: "pend" },
        { pnl: null, side: "buy" },
      ]),
      9,
    );
  });

  it("approximates dollar risk to stops from live P/L vs price distance", () => {
    const risk = openRiskToStops([
      {
        side: "buy",
        volume: 0.3,
        openPrice: 100,
        currentPrice: 110,
        pnl: 10,
        stopLoss: 95,
      },
    ]);
    assert.equal(risk, 5);
    assert.equal(
      openRiskToStops([
        { side: "buy", volume: 1, openPrice: 100, currentPrice: 100, pnl: 0, stopLoss: 95 },
      ]),
      null,
    );
  });

  it("computes performance from net P/L, oldest-to-newest equity", () => {
    const empty = performanceStats([]);
    assert.equal(empty.count, 0);
    assert.equal(empty.winRate, null);
    assert.equal(empty.net, 0);

    const stats = performanceStats([
      { pnl: 20, fees: -2 },
      { pnl: -10, fees: -1 },
      { pnl: 8, fees: 0 },
    ]);
    assert.equal(stats.count, 3);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 1);
    assert.equal(stats.net, 15);
    assert.equal(stats.equity[stats.equity.length - 1], 15);
    assert.ok(stats.winRate != null && Math.abs(stats.winRate - 2 / 3) < 1e-9);
    assert.ok(stats.profitFactor != null && stats.profitFactor > 1);
  });

  it("buckets calendar P/L by local day", () => {
    const map = calendarMonthPnl(
      [
        { closeTime: "2026-11-03T15:00:00.000Z", pnl: 40, fees: -2 },
        { closeTime: "2026-11-03T16:00:00.000Z", pnl: -5, fees: 0 },
        { closeTime: "2026-10-31T12:00:00.000Z", pnl: 99, fees: 0 },
      ],
      2026,
      10,
      "UTC",
    );
    assert.equal(map[3], 33);
    assert.equal(map[31], undefined);
  });

  it("builds an equity polyline", () => {
    const { line, area } = equityPolyline([0, 10, 5], 100, 50);
    assert.match(line, /^M/);
    assert.match(area, /Z$/);
    assert.equal(equityPolyline([]).line, "");
  });
});
