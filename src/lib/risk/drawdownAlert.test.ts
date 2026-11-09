import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bandForUtilization,
  evaluateDrawdownAlerts,
  readingForKind,
} from "./drawdownAlert";
import type { TradingConstraints } from "./accountProfile";

const ftmoLike: Pick<
  TradingConstraints,
  "maxDailyLossPct" | "maxDailyLossBasis" | "maxTotalLossPct" | "maxTotalLossBasis"
> = {
  maxDailyLossPct: 5,
  maxDailyLossBasis: "day_start_balance",
  maxTotalLossPct: 10,
  maxTotalLossBasis: "initial_balance",
};

describe("drawdown bands", () => {
  it("warns at 70, 85 and 95 percent of the firm's limit", () => {
    assert.equal(bandForUtilization(69.9), null);
    assert.equal(bandForUtilization(70), 70);
    assert.equal(bandForUtilization(84.9), 70);
    assert.equal(bandForUtilization(85), 85);
    assert.equal(bandForUtilization(94.9), 85);
    assert.equal(bandForUtilization(95), 95);
    assert.equal(bandForUtilization(99.9), 95);
  });

  it("reports a reached or breached limit as its own band, not as 95%", () => {
    assert.equal(bandForUtilization(100), 100);
    assert.equal(bandForUtilization(130), 100);
    const [daily] = evaluateDrawdownAlerts({
      accountId: "acc-1",
      constraints: ftmoLike,
      snap: {
        equity: 94_000,
        balance: 100_000,
        dayStartBalance: 100_000,
        dayStartEquity: 100_000,
        initialBalance: 100_000,
        peakBalance: 100_000,
      },
      now: new Date("2026-11-09T12:00:00Z"),
    });
    assert.equal(daily.kind, "daily");
    assert.equal(daily.band, 100);
    assert.match(daily.notice.title, /limit reached/);
    assert.equal(daily.eventKey, "drawdown:acc-1:daily:100:2026-11-09");
  });
});

describe("readingForKind", () => {
  it("measures daily loss from the day's opening balance", () => {
    const reading = readingForKind("daily", ftmoLike, {
      equity: 96_500,
      balance: 96_500,
      dayStartBalance: 100_000,
      dayStartEquity: 100_000,
      initialBalance: 100_000,
      peakBalance: 100_000,
    });
    assert.ok(reading);
    assert.equal(Number(reading.usedPct.toFixed(1)), 3.5);
    assert.equal(reading.ofLimitPct, 70);
    assert.equal(reading.limitPct, 5);
  });

  it("measures total drawdown from initial capital", () => {
    const reading = readingForKind("total", ftmoLike, {
      equity: 91_500,
      balance: 91_500,
      dayStartBalance: 92_000,
      dayStartEquity: 92_000,
      initialBalance: 100_000,
      peakBalance: 100_000,
    });
    assert.ok(reading);
    assert.equal(reading.usedPct, 8.5);
    assert.equal(reading.ofLimitPct, 85);
  });
});

describe("evaluateDrawdownAlerts", () => {
  it("emits a daily 70% notice with somewhere to go", () => {
    const alerts = evaluateDrawdownAlerts({
      accountId: "acct-1",
      constraints: ftmoLike,
      snap: {
        equity: 96_500,
        balance: 96_500,
        dayStartBalance: 100_000,
        dayStartEquity: 100_000,
        initialBalance: 100_000,
        peakBalance: 100_000,
      },
      now: new Date("2026-10-28T12:00:00.000Z"),
    });
    const daily = alerts.find((a) => a.kind === "daily");
    assert.ok(daily);
    assert.equal(daily.band, 70);
    assert.equal(daily.eventKey, "drawdown:acct-1:daily:70:2026-10-28");
    assert.equal(daily.notice.action.href, "/positions");
    assert.match(daily.notice.title, /70%/);
  });

  it("stays quiet when the account is flat", () => {
    const alerts = evaluateDrawdownAlerts({
      accountId: "acct-1",
      constraints: ftmoLike,
      snap: {
        equity: 100_000,
        balance: 100_000,
        dayStartBalance: 100_000,
        dayStartEquity: 100_000,
        initialBalance: 100_000,
        peakBalance: 100_000,
      },
    });
    assert.equal(alerts.length, 0);
  });
});
