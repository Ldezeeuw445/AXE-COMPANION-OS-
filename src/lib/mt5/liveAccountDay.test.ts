import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateDrawdownAlerts } from "../risk/drawdownAlert";
import { liveAccountDayKey, liveEquitySnapshotFromMetadata, nextLiveAccountState } from "./liveAccountSnapshot";
import type { LiveAccountFigures } from "./liveAccountSnapshot";

/**
 * The daily-loss anchor must roll on the broker's day (MT5 server time, EET by
 * default) — the same boundary the prop firm and tradeGuardService use — not
 * on the UTC date. Nov 2026: Athens is UTC+2, so the broker day starts 22:00Z.
 */

function figs(balance: number, equity = balance): LiveAccountFigures {
  return { balance, equity, margin: null, freeMargin: null, marginLevel: null, currency: "USD", profit: equity - balance };
}

function live(meta: Record<string, unknown>): Record<string, unknown> {
  return meta.liveAccountState as Record<string, unknown>;
}

describe("nextLiveAccountState — broker-day anchor", () => {
  it("rolls the day-start balance at broker midnight (22:00Z in winter), not at UTC midnight", () => {
    const evening = nextLiveAccountState({}, figs(100_000), new Date("2026-11-15T20:00:00Z"));
    // 22:30Z = 00:30 broker time on Nov 16: a new firm day has started.
    const newDay = nextLiveAccountState(evening, figs(98_000), new Date("2026-11-15T22:30:00Z"));
    assert.equal(live(newDay).dayStartBalance, 98_000);
    assert.equal(live(newDay).dayStartDate, "2026-11-16");
  });

  it("does not forget losses taken before UTC midnight inside the same broker day", () => {
    const open = nextLiveAccountState({}, figs(100_000), new Date("2026-11-15T22:05:00Z"));
    // Lost 3% between 00:05 and 02:00 broker time…
    const afterUtcMidnight = nextLiveAccountState(open, figs(97_000), new Date("2026-11-16T00:30:00Z"));
    // …the firm still measures from 100k; so must AXE.
    assert.equal(live(afterUtcMidnight).dayStartBalance, 100_000);
    const snap = liveEquitySnapshotFromMetadata(afterUtcMidnight, figs(97_000));
    assert.ok(snap);
    const alerts = evaluateDrawdownAlerts({
      accountId: "a1",
      constraints: { maxDailyLossPct: 4, maxDailyLossBasis: "day_start_balance", maxTotalLossPct: null, maxTotalLossBasis: null },
      snap,
      now: new Date("2026-11-16T00:30:00Z"),
    });
    assert.equal(alerts.length, 1, "3% of a 4% daily cap must warn");
    assert.equal(alerts[0].band, 70);
  });

  it("honours the account's stored broker timezone", () => {
    const meta = { brokerTimezone: "UTC" };
    const a = nextLiveAccountState(meta, figs(100_000), new Date("2026-11-15T20:00:00Z"));
    const b = nextLiveAccountState(a, figs(98_000), new Date("2026-11-15T22:30:00Z"));
    assert.equal(live(b).dayStartBalance, 100_000, "UTC broker: 22:30Z is still the same day");
    assert.equal(liveAccountDayKey(meta, new Date("2026-11-15T22:30:00Z")), "2026-11-15");
  });

  it("honours a non-midnight dailyResetTime", () => {
    const meta = { brokerTimezone: "UTC", dailyResetTime: "17:00" };
    assert.equal(liveAccountDayKey(meta, new Date("2026-11-15T16:59:00Z")), "2026-11-14");
    assert.equal(liveAccountDayKey(meta, new Date("2026-11-15T17:01:00Z")), "2026-11-15");
  });
});

describe("evaluateDrawdownAlerts — dedup day follows the broker day", () => {
  it("uses the supplied broker dayStamp in the event key", () => {
    const alerts = evaluateDrawdownAlerts({
      accountId: "a1",
      constraints: { maxDailyLossPct: 4, maxDailyLossBasis: "day_start_balance", maxTotalLossPct: null, maxTotalLossBasis: null },
      snap: { equity: 96_000, balance: 96_000, dayStartBalance: 100_000, dayStartEquity: 100_000, initialBalance: 100_000, peakBalance: 100_000 },
      now: new Date("2026-11-15T22:30:00Z"),
      dayStamp: liveAccountDayKey({}, new Date("2026-11-15T22:30:00Z")),
    });
    assert.equal(alerts[0].eventKey, "drawdown:a1:daily:100:2026-11-16");
  });
});
