import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAccountProfile } from "./accountProfile";
import {
  DAY_ANCHOR_MAX_LATE_MINUTES,
  GUARD_EQUITY_MAX_AGE_SECONDS,
  dayAnchorOnTime,
  canRefreshLiveState,
  judgeReading,
  limitsNeedEquity,
  readLiveAccountReading,
  readingAgeSeconds,
  resolveGuardEquity,
} from "./guardEquity";
import { guardLossInputs } from "./guardLossInputs";
import { evaluateAutoTrade, type AutoTradeGuardInput } from "../trading/autoTradeGuard";
import { liveAccountDayKey, nextLiveAccountState } from "../mt5/liveAccountSnapshot";
import { brokerDayStart } from "../chart/sessionDay";

const NOW = new Date("2026-11-11T12:00:00Z"); // Wednesday, 14:00 broker time (EET)
const DAY = liveAccountDayKey({}, NOW);
/** Start of the broker day (EET default): 2026-11-10T22:00Z. */
const DAY_START = brokerDayStart(NOW, "Europe/Athens", "00:00");
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);

/** Metadata exactly as persistLiveFiguresAndPositions writes it. */
function metaAt(at: Date, figures: { balance: number; equity: number }, prev: Record<string, unknown> = {}) {
  return nextLiveAccountState(
    prev,
    { ...figures, margin: null, freeMargin: null, marginLevel: null, currency: "USD", profit: null },
    at,
  );
}

const twoStep = buildAccountProfile({
  label: "FTMO 2-Step Funded 100K",
  mt5Server: "FTMO-Server",
  metadata: { firmModel: "2-Step" },
});

function resolveWith(
  metadata: Record<string, unknown>,
  opts: { canRefresh?: boolean; refresh?: () => Promise<Record<string, unknown> | null> } = {},
) {
  let calls = 0;
  const refresh = opts.refresh ?? (async () => null);
  return resolveGuardEquity({
    metadata,
    now: NOW,
    dayKey: DAY,
    canRefresh: opts.canRefresh ?? true,
    refresh: async () => {
      calls += 1;
      return refresh();
    },
  }).then((r) => ({ r, calls: () => calls }));
}

function guard(over: Partial<AutoTradeGuardInput>): AutoTradeGuardInput {
  return {
    profile: twoStep,
    volumeLots: 0.1,
    openPositions: 0,
    autoTradesToday: 0,
    dayResultPct: 0,
    totalLoss: { status: "ok", usedPct: 0, limitPct: 10 },
    minutesToHighImpact: null,
    now: NOW,
    ...over,
  };
}

describe("readLiveAccountReading", () => {
  it("reads what nextLiveAccountState writes", () => {
    const r = readLiveAccountReading(metaAt(ago(10), { balance: 100_000, equity: 99_000 }));
    assert.equal(r.equity, 99_000);
    assert.equal(r.balance, 100_000);
    assert.equal(r.dayStartBalance, 100_000);
    assert.equal(r.dayStartDate, DAY);
    assert.equal(r.peakBalance, 100_000);
    assert.equal(r.initialBalance, 100_000);
    assert.equal(r.updatedAt, ago(10).toISOString());
  });

  it("is all null for no / malformed state", () => {
    for (const m of [null, undefined, [], {}, { liveAccountState: "x" }, { liveAccountState: [] }]) {
      const r = readLiveAccountReading(m);
      assert.equal(r.equity, null);
      assert.equal(r.updatedAt, null);
    }
    assert.equal(readLiveAccountReading({ liveAccountState: { equity: 0, balance: -1 } }).equity, null);
  });
});

describe("judgeReading", () => {
  const fresh = readLiveAccountReading(metaAt(ago(30), { balance: 100_000, equity: 100_000 }));

  it("usable up to the maximum age, stale one second later", () => {
    const at = (sec: number) => readLiveAccountReading(metaAt(ago(sec), { balance: 1, equity: 1 }));
    assert.equal(judgeReading(at(GUARD_EQUITY_MAX_AGE_SECONDS), NOW, DAY), "usable");
    assert.equal(judgeReading(at(GUARD_EQUITY_MAX_AGE_SECONDS + 1), NOW, DAY), "stale");
  });

  it("missing, undated, future and wrong-day readings are not usable", () => {
    assert.equal(judgeReading(readLiveAccountReading({}), NOW, DAY), "missing");
    assert.equal(judgeReading({ ...fresh, updatedAt: null }, NOW, DAY), "undated");
    assert.equal(judgeReading({ ...fresh, updatedAt: "garbage" }, NOW, DAY), "undated");
    assert.equal(judgeReading({ ...fresh, updatedAt: ago(-600).toISOString() }, NOW, DAY), "future");
    assert.equal(judgeReading({ ...fresh, dayStartDate: "2026-11-10" }, NOW, DAY), "wrong_day");
    assert.equal(judgeReading({ ...fresh, dayStartDate: null }, NOW, DAY), "wrong_day");
  });

  it("readingAgeSeconds", () => {
    assert.equal(readingAgeSeconds(fresh, NOW), 30);
  });
});

describe("resolveGuardEquity — fresh", () => {
  it("a fresh stored reading is used as is, with no broker call", async () => {
    const meta = metaAt(ago(20), { balance: 100_000, equity: 99_500 });
    const { r, calls } = await resolveWith(meta);
    assert.equal(r.usable, true);
    assert.equal(r.source, "stored");
    assert.equal(r.refreshAttempted, false);
    assert.equal(calls(), 0);
    assert.equal(r.reading.equity, 99_500);
  });
});

describe("resolveGuardEquity — stale, then refreshed", () => {
  it("refreshes a stale reading once and uses the refreshed state", async () => {
    const stale = metaAt(ago(3_600), { balance: 100_000, equity: 100_000 });
    const fresh = metaAt(ago(2), { balance: 100_000, equity: 93_000 }, stale);
    const { r, calls } = await resolveWith(stale, { refresh: async () => fresh });
    assert.equal(calls(), 1);
    assert.equal(r.usable, true);
    assert.equal(r.source, "refreshed");
    assert.equal(r.reading.equity, 93_000, "the refreshed equity, not the hour-old one");
  });

  it("a reading from yesterday's broker day is refreshed so the day anchors roll", async () => {
    const yesterday = new Date("2026-11-10T20:00:00Z");
    const old = metaAt(yesterday, { balance: 100_000, equity: 100_000 });
    const rolled = metaAt(ago(1), { balance: 98_000, equity: 97_000 }, old);
    const { r, calls } = await resolveWith(old, { refresh: async () => rolled });
    assert.equal(calls(), 1);
    assert.equal(r.usable, true);
    assert.equal(r.reading.dayStartDate, DAY);
    assert.equal(r.reading.dayStartBalance, 98_000, "anchor is today's first reading, not yesterday's 100k");
  });

  it("an account that was never synced (no liveAccountState) gets a refresh", async () => {
    const fresh = metaAt(ago(1), { balance: 50_000, equity: 50_000 });
    const { r, calls } = await resolveWith({}, { refresh: async () => fresh });
    assert.equal(calls(), 1);
    assert.equal(r.usable, true);
  });
});

describe("resolveGuardEquity — refresh fails: unknown, and unknown blocks", () => {
  const stale = metaAt(ago(3_600), { balance: 100_000, equity: 100_000 });

  for (const [name, refresh] of [
    ["returns null", async () => null],
    [
      "throws",
      async (): Promise<Record<string, unknown> | null> => {
        throw new Error("metaapi down");
      },
    ],
  ] as const) {
    it(`refresh ${name}: not usable, flagged failed, and the guard refuses an unattended order`, async () => {
      const { r, calls } = await resolveWith(stale, { refresh });
      assert.equal(calls(), 1);
      assert.equal(r.usable, false);
      assert.equal(r.refreshFailed, true);
      const inputs = guardLossInputs({
        limits: twoStep,
        resolved: r,
        floatingPnl: 0,
        accountSize: 100_000,
        inferredInitial: null,
        inferredPeak: null,
        now: NOW,
      });
      assert.equal(inputs.currentEquity, null);
      assert.equal(inputs.dayResultPct, null);
      assert.equal(inputs.totalLoss.status, "unknown");
      const d = evaluateAutoTrade(guard({ ...inputs }));
      assert.equal(d.allowed, false);
      assert.match(!d.allowed ? d.reason : "", /^(total|daily)_loss_unknown$/);
    });
  }

  it("a refresh that persisted nothing (state still stale) is not usable either", async () => {
    const { r } = await resolveWith(stale, { refresh: async () => stale });
    assert.equal(r.usable, false);
    assert.equal(r.refreshFailed, false);
    assert.equal(r.verdict, "stale");
  });

  it("stale equity with a healthy-looking figure never counts as fine", async () => {
    const { r } = await resolveWith(stale);
    const inputs = guardLossInputs({
      limits: twoStep,
      resolved: r,
      floatingPnl: 0,
      accountSize: 100_000,
      inferredInitial: null,
      inferredPeak: null,
      now: NOW,
      dayStart: DAY_START,
    });
    assert.equal(inputs.totalLoss.status, "unknown");
    assert.match(inputs.totalLoss.status === "unknown" ? inputs.totalLoss.detail : "", /equity/i);
  });
});

describe("MT5 vs Alpaca / paper / no limits", () => {
  it("only cloud MT5 accounts with a limit can be refreshed", () => {
    assert.equal(canRefreshLiveState({ connectionMethod: "cloud_mt5", needsEquity: true }), true);
    assert.equal(canRefreshLiveState({ connectionMethod: "cloud_alpaca", needsEquity: true }), false);
    assert.equal(canRefreshLiveState({ connectionMethod: "demo_paper", needsEquity: true }), false);
    assert.equal(canRefreshLiveState({ connectionMethod: null, needsEquity: true }), false);
    assert.equal(canRefreshLiveState({ connectionMethod: "cloud_mt5", needsEquity: false }), false);
  });

  it("limitsNeedEquity: any positive limit; none for live/demo/Alpaca-style accounts", () => {
    assert.equal(limitsNeedEquity(twoStep), true);
    assert.equal(limitsNeedEquity({ maxDailyLossPct: 5, maxTotalLossPct: null }), true);
    assert.equal(limitsNeedEquity({ maxDailyLossPct: null, maxTotalLossPct: 10 }), true);
    assert.equal(limitsNeedEquity({ maxDailyLossPct: null, maxTotalLossPct: null }), false);
    assert.equal(limitsNeedEquity({ maxDailyLossPct: 0, maxTotalLossPct: undefined }), false);
    const alpaca = buildAccountProfile({ label: "Alpaca Paper", mt5Server: null, connectionMethod: "cloud_alpaca" });
    assert.equal(limitsNeedEquity(alpaca), false);
  });

  it("an Alpaca account with a (stated) limit and a stale state is not refreshed and stays unknown", async () => {
    const stale = metaAt(ago(3_600), { balance: 10_000, equity: 10_000 });
    const { r, calls } = await resolveWith(stale, {
      canRefresh: canRefreshLiveState({ connectionMethod: "cloud_alpaca", needsEquity: true }),
      refresh: async () => metaAt(ago(1), { balance: 10_000, equity: 10_000 }),
    });
    assert.equal(calls(), 0, "no broker call for an account without a read-only path");
    assert.equal(r.usable, false);
    assert.equal(r.refreshAttempted, false);
  });

  it("an MT5 account with no limits never triggers a refresh (resolve is not even asked to)", () => {
    const live = buildAccountProfile({ label: "MT5 LIVE", mt5Server: "ICMarkets-Live" });
    const needs = limitsNeedEquity(live);
    assert.equal(needs, false);
    assert.equal(canRefreshLiveState({ connectionMethod: "cloud_mt5", needsEquity: needs }), false);
  });
});

describe("guardLossInputs — daily (#172 broker day) and total (#179 account size) from one reading", () => {
  const usable = (equity: number, balance = 100_000, dayStart = 100_000) => ({
    usable: true,
    reading: {
      ...readLiveAccountReading(metaAt(ago(5), { balance, equity })),
      // Anchors captured 1 minute after the broker-day open.
      dayStartAt: new Date(DAY_START.getTime() + 60_000).toISOString(),
      dayStartBalance: dayStart,
      dayStartEquity: dayStart,
      peakBalance: 100_000,
      initialBalance: 95_000, // first balance AXE saw: lower than the real account size
    },
  });

  it("daily % is of the stated account size, measured from today's anchor", () => {
    const i = guardLossInputs({
      limits: twoStep,
      resolved: usable(94_000),
      floatingPnl: 0,
      accountSize: 100_000,
      inferredInitial: null,
      inferredPeak: null,
      now: NOW,
      dayStart: DAY_START,
    });
    assert.equal(i.dayResultPct, -6);
    assert.equal(evaluateAutoTrade(guard({ ...i })).allowed, false);
    assert.equal(i.totalLoss.status, "ok", "6% of a 10% total limit");
  });

  it("total loss uses the stated size, not the first balance AXE saw", () => {
    // 90.3k: 9.7% under 100k (blocked); under the first-seen 95k it would be 4.9%.
    const i = guardLossInputs({
      limits: twoStep,
      resolved: usable(90_300, 100_000, 90_400),
      floatingPnl: 0,
      accountSize: 100_000,
      inferredInitial: null,
      inferredPeak: null,
      now: NOW,
      dayStart: DAY_START,
    });
    assert.equal(i.totalLoss.status, "blocked");
    const d = evaluateAutoTrade(guard({ ...i, dayResultPct: 0 }));
    assert.equal(!d.allowed && d.reason, "total_loss_reached");
  });

  it("a healthy account passes both checks", () => {
    const i = guardLossInputs({
      limits: twoStep,
      resolved: usable(99_500),
      floatingPnl: 0,
      accountSize: 100_000,
      inferredInitial: null,
      inferredPeak: null,
      now: NOW,
      dayStart: DAY_START,
    });
    assert.equal(evaluateAutoTrade(guard({ ...i })).allowed, true);
  });

  it("with no equity but a balance, floating P&L is added — never used alone", () => {
    const base = usable(1);
    const r = { usable: true, reading: { ...base.reading, equity: null, balance: 100_000 } };
    const i = guardLossInputs({
      limits: twoStep,
      resolved: r,
      floatingPnl: -4_000,
      accountSize: 100_000,
      inferredInitial: null,
      inferredPeak: null,
      now: NOW,
      dayStart: DAY_START,
    });
    assert.equal(i.currentEquity, 96_000);
  });

  it("day anchors of another day are never used: not usable ⇒ unknown, even with numbers present", async () => {
    const old = metaAt(new Date("2026-11-10T20:00:00Z"), { balance: 100_000, equity: 100_000 });
    const { r } = await resolveWith(old, { canRefresh: false });
    const i = guardLossInputs({
      limits: twoStep,
      resolved: r,
      floatingPnl: 0,
      accountSize: 100_000,
      inferredInitial: null,
      inferredPeak: null,
      now: NOW,
      dayStart: DAY_START,
    });
    assert.equal(i.dayResultPct, null);
    assert.equal(evaluateAutoTrade(guard({ ...i })).allowed, false);
  });

  it("a day_start_balance basis anchors on balance, others on the stricter of balance/equity", () => {
    const r = {
      usable: true,
      reading: { ...usable(95_000).reading, dayStartBalance: 100_000, dayStartEquity: 102_000, initialBalance: null },
    };
    const args = { resolved: r, floatingPnl: 0, accountSize: null, inferredInitial: null, inferredPeak: null, now: NOW, dayStart: DAY_START };
    const bal = guardLossInputs({ ...args, limits: { ...twoStep, maxDailyLossBasis: "day_start_balance" } });
    const eq = guardLossInputs({ ...args, limits: { ...twoStep, maxDailyLossBasis: "day_start_equity" } });
    assert.ok(bal.dayResultPct != null && eq.dayResultPct != null);
    assert.ok(Math.abs(bal.dayResultPct - -5) < 1e-9);
    assert.ok(eq.dayResultPct < bal.dayResultPct);
  });
});

describe("the day anchor must be captured at the broker-day open (late anchor ⇒ daily unknown)", () => {
  const FIG = { balance: 100_000, equity: 94_000 };
  const args = (resolved: Parameters<typeof guardLossInputs>[0]["resolved"]) => ({
    limits: twoStep,
    resolved,
    floatingPnl: 0,
    accountSize: 100_000,
    inferredInitial: null,
    inferredPeak: null,
    now: NOW,
    dayStart: DAY_START,
  });
  /** Persist at the day open, then keep updating — what a live account does. */
  const onTimeMeta = () => {
    const open = metaAt(new Date(DAY_START.getTime() + 3 * 60_000), { balance: 100_000, equity: 100_000 });
    return metaAt(ago(5), FIG, open);
  };

  it("nextLiveAccountState records dayStartAt on the roll and keeps it afterwards", () => {
    const open = metaAt(new Date(DAY_START.getTime() + 3 * 60_000), { balance: 100_000, equity: 100_000 });
    const later = metaAt(ago(5), FIG, open);
    const a = readLiveAccountReading(open);
    const b = readLiveAccountReading(later);
    assert.equal(a.dayStartAt, new Date(DAY_START.getTime() + 3 * 60_000).toISOString());
    assert.equal(b.dayStartAt, a.dayStartAt, "later updates the same day do not move the anchor time");
    assert.equal(b.dayStartBalance, 100_000);
  });

  it("anchor captured right after the open: daily loss is measured", async () => {
    const { r } = await resolveWith(onTimeMeta(), { canRefresh: false });
    assert.equal(r.usable, true);
    const i = guardLossInputs(args(r));
    assert.equal(i.dayResultPct, -6);
    assert.equal(evaluateAutoTrade(guard({ ...i })).reason, "daily_loss_reached");
  });

  it("anchor rolled by a 10:00 refresh: daily is unknown and an unattended trade is blocked — even though equity looks fine", async () => {
    const stale = metaAt(new Date("2026-11-10T20:00:00Z"), { balance: 100_000, equity: 100_000 });
    // The refresh happens at NOW (14:00 broker time) and rolls the day with today's figures.
    const rolled = metaAt(ago(1), { balance: 99_000, equity: 99_000 }, stale);
    const { r } = await resolveWith(stale, { refresh: async () => rolled });
    assert.equal(r.usable, true, "equity itself is fresh");
    const i = guardLossInputs(args(r));
    assert.equal(i.dayResultPct, null, "but the anchor is 14 h late — the earlier loss is invisible");
    assert.equal(i.totalLoss.status, "ok", "the total check does not depend on the day anchor");
    const d = evaluateAutoTrade(guard({ ...i }));
    assert.equal(d.allowed, false);
    assert.equal(!d.allowed && d.reason, "daily_loss_unknown");
  });

  it("state written before dayStartAt existed: daily unknown", async () => {
    const meta = onTimeMeta();
    const live = { ...(meta.liveAccountState as Record<string, unknown>) };
    delete live.dayStartAt;
    const { r } = await resolveWith({ ...meta, liveAccountState: live }, { canRefresh: false });
    assert.equal(r.usable, true);
    assert.equal(guardLossInputs(args(r)).dayResultPct, null);
  });

  it("dayAnchorOnTime tolerance: up to the maximum lateness, not after, not missing", () => {
    const at = (min: number) =>
      ({ ...readLiveAccountReading({}), dayStartAt: new Date(DAY_START.getTime() + min * 60_000).toISOString() });
    assert.equal(dayAnchorOnTime(at(0), DAY_START), true);
    assert.equal(dayAnchorOnTime(at(DAY_ANCHOR_MAX_LATE_MINUTES), DAY_START), true);
    assert.equal(dayAnchorOnTime(at(DAY_ANCHOR_MAX_LATE_MINUTES + 1), DAY_START), false);
    assert.equal(dayAnchorOnTime(at(-30), DAY_START), false);
    assert.equal(dayAnchorOnTime({ ...readLiveAccountReading({}), dayStartAt: null }, DAY_START), false);
    assert.equal(dayAnchorOnTime({ ...readLiveAccountReading({}), dayStartAt: "x" }, DAY_START), false);
  });
});
