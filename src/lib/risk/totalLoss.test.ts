import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAccountProfile } from "./accountProfile";
import { dailyLossReference } from "./dailyLoss";
import {
  TOTAL_LOSS_BUFFER_PCT,
  TOTAL_LOSS_MAX_EQUITY_AGE_MINUTES,
  evaluateTotalLoss,
  freshestEquity,
  liveEquityReading,
  livePeakBalance,
  totalLossFrame,
} from "./totalLoss";
import { evaluateAutoTrade, type AutoTradeGuardInput } from "../trading/autoTradeGuard";

const NOW = new Date("2026-11-11T12:00:00Z"); // Wednesday noon
const FRESH = new Date(NOW.getTime() - 60_000);

const staticInput = {
  equityAsOf: FRESH,
  now: NOW,
  maxTotalLossPct: 10,
  basis: "initial_balance" as const,
  accountSize: 100_000,
  initialBalance: 100_000,
  peakBalance: 100_000,
};

describe("evaluateTotalLoss — static (initial_balance)", () => {
  it("blocks at the floor, measured from the STATED account size, not the first balance AXE saw", () => {
    // First seen $95k on a $100k account; floor is $90k. At $90.3k the account is
    // 9.7% down — past the buffered limit (9.5%). Measured from the first-seen
    // balance it would read 4.9% and trade on.
    const d = evaluateTotalLoss({ ...staticInput, initialBalance: 95_000, currentEquity: 90_300 });
    assert.equal(d.status, "blocked");
    assert.equal(d.status === "blocked" && d.reason, "total_loss_reached");
    assert.match(d.status === "blocked" ? d.detail : "", /9\.70% down from the starting balance/);
    assert.match(d.status === "blocked" ? d.detail : "", /maximum total loss is 10%/);
  });

  it("without the stated size, falls back to the first recorded balance (same order as the alert)", () => {
    const d = evaluateTotalLoss({ ...staticInput, accountSize: null, initialBalance: 100_000, currentEquity: 90_400 });
    assert.equal(d.status, "blocked");
  });

  it("a stated size above the ceiling is ignored, not used as a base", () => {
    const d = evaluateTotalLoss({ ...staticInput, accountSize: 20_000_000, currentEquity: 91_000 });
    // Falls back to the recorded 100k: 9% down < 9.5% → trades. Used as a base,
    // a 20M "size" would read as a 99.5% loss.
    assert.equal(d.status, "ok");
  });

  it("is blocked exactly at the buffered limit and beyond the limit itself", () => {
    const at = evaluateTotalLoss({ ...staticInput, currentEquity: 100_000 * (1 - (10 - TOTAL_LOSS_BUFFER_PCT) / 100) });
    assert.equal(at.status, "blocked");
    const past = evaluateTotalLoss({ ...staticInput, currentEquity: 89_000 });
    assert.equal(past.status, "blocked");
  });

  it("allows just inside the buffer, in profit, and with no loss", () => {
    assert.equal(evaluateTotalLoss({ ...staticInput, currentEquity: 90_600 }).status, "ok");
    assert.equal(evaluateTotalLoss({ ...staticInput, currentEquity: 112_000 }).status, "ok");
    assert.equal(evaluateTotalLoss({ ...staticInput, currentEquity: 100_000 }).status, "ok");
  });

  it("an account in profit does not get a false alarm from a first-seen balance above the real size", () => {
    // Connected at $110k on a $100k account: with the stated size the floor is $90k.
    const d = evaluateTotalLoss({ ...staticInput, initialBalance: 110_000, currentEquity: 98_000 });
    assert.equal(d.status, "ok");
    // Measured from the first-seen balance this would have been 10.9% down and blocked.
  });

  it("uses equity (floating loss counts): the caller passes equity, not balance", () => {
    const d = evaluateTotalLoss({ ...staticInput, currentEquity: 90_100 });
    assert.equal(d.status, "blocked");
  });
});

describe("evaluateTotalLoss — trailing models", () => {
  const trailing = { ...staticInput, basis: "trailing_peak_balance" as const, peakBalance: 108_000 };

  it("measures from the recorded peak, not the account size", () => {
    // 108k peak, equity 97k: 10.2% below the peak → blocked. Static reading
    // (97k vs 100k = 3%) would trade on.
    assert.equal(evaluateTotalLoss({ ...trailing, currentEquity: 97_000 }).status, "blocked");
    assert.equal(evaluateTotalLoss({ ...trailing, currentEquity: 100_000 }).status, "ok");
  });

  it("end-of-day trailing uses the same recorded peak", () => {
    const eod = { ...trailing, basis: "trailing_eod_balance" as const };
    assert.equal(evaluateTotalLoss({ ...eod, currentEquity: 97_000 }).status, "blocked");
  });

  it("trailing with no recorded peak fails closed — the account size is not a peak", () => {
    const d = evaluateTotalLoss({ ...trailing, peakBalance: null, currentEquity: 100_000 });
    assert.equal(d.status, "unknown");
  });
});

describe("evaluateTotalLoss — missing data fails closed", () => {
  it("no limit set: nothing to enforce, even without data", () => {
    assert.deepEqual(evaluateTotalLoss({ maxTotalLossPct: null, basis: null, currentEquity: null, equityAsOf: null, now: NOW }), {
      status: "ok",
      usedPct: null,
      limitPct: null,
    });
    assert.equal(evaluateTotalLoss({ maxTotalLossPct: 0, basis: "initial_balance", currentEquity: null, equityAsOf: null, now: NOW }).status, "ok");
  });

  it("limit set but equity unknown → total_loss_unknown", () => {
    const d = evaluateTotalLoss({ ...staticInput, currentEquity: null });
    assert.equal(d.status, "unknown");
    assert.equal(d.status === "unknown" && d.reason, "total_loss_unknown");
    assert.match(d.status === "unknown" ? d.detail : "", /live equity/);
  });

  it("limit set, static basis, no account size and no recorded balance → unknown", () => {
    const d = evaluateTotalLoss({
      equityAsOf: FRESH,
      now: NOW,
      maxTotalLossPct: 10,
      basis: "initial_balance",
      currentEquity: 95_000,
      accountSize: null,
      initialBalance: null,
      peakBalance: 100_000,
    });
    assert.equal(d.status, "unknown");
    assert.match(d.status === "unknown" ? d.detail : "", /account size/);
  });

  it("zero / negative / NaN equity is unknown, never a loss of 100% or a pass", () => {
    for (const eq of [0, -5, Number.NaN]) {
      assert.equal(evaluateTotalLoss({ ...staticInput, currentEquity: eq }).status, "unknown");
    }
  });

  it("a day_start_* basis is not a total-loss basis: unknown", () => {
    assert.equal(
      evaluateTotalLoss({ ...staticInput, basis: "day_start_balance", currentEquity: 99_000 }).status,
      "unknown",
    );
  });
});

describe("evaluateTotalLoss — no basis is unknown, never guessed", () => {
  it("a percentage with no basis fails closed, even deep in profit and with all figures known", () => {
    const d = evaluateTotalLoss({
      maxTotalLossPct: 8,
      basis: null,
      currentEquity: 120_000,
      equityAsOf: FRESH,
      now: NOW,
      accountSize: 100_000,
      initialBalance: 100_000,
      peakBalance: 110_000,
    });
    assert.equal(d.status, "unknown");
    assert.match(d.status === "unknown" ? d.detail : "", /static or trailing/);
    assert.match(d.status === "unknown" ? d.detail : "", /firm and account type/);
  });

  it("FTMO without a named model has a 10% limit but no basis: unattended auto-trade is refused until the model is picked", () => {
    const unnamed = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
    assert.equal(unnamed.maxTotalLossPct, 10);
    assert.equal(unnamed.maxTotalLossBasis, null);
    const totalLoss = evaluateTotalLoss({
      ...staticInput,
      maxTotalLossPct: unnamed.maxTotalLossPct,
      basis: unnamed.maxTotalLossBasis,
      currentEquity: 100_000,
    });
    assert.equal(totalLoss.status, "unknown");
    const d = evaluateAutoTrade({ ...guardBase({ profile: unnamed, totalLoss }) });
    assert.equal(!d.allowed && d.reason, "total_loss_unknown");
    // Naming the model resolves it.
    const named = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server", metadata: { firmModel: "2-Step" } });
    assert.equal(named.maxTotalLossBasis, "initial_balance");
  });

  it("a trader-typed total percentage has no basis either: unknown", () => {
    const typed = buildAccountProfile({
      label: "FTMO Funded 100K",
      mt5Server: "FTMO-Server",
      metadata: { firmModel: "2-Step", tradingRules: { maxTotalLossPct: 8 } },
    });
    assert.equal(typed.maxTotalLossPct, 8);
    assert.equal(typed.maxTotalLossBasis, null);
  });

  it("totalLossFrame is null without a basis", () => {
    assert.equal(totalLossFrame({ basis: null, accountSize: 100_000, initialBalance: 95_000, peakBalance: 110_000 }), null);
  });
});

describe("evaluateTotalLoss — stale or undated equity fails closed", () => {
  const at = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60_000);

  it("fresh equity is used; just past the maximum age is refused", () => {
    assert.equal(evaluateTotalLoss({ ...staticInput, currentEquity: 99_000, equityAsOf: at(5) }).status, "ok");
    assert.equal(
      evaluateTotalLoss({ ...staticInput, currentEquity: 99_000, equityAsOf: at(TOTAL_LOSS_MAX_EQUITY_AGE_MINUTES) }).status,
      "ok",
    );
    const stale = evaluateTotalLoss({ ...staticInput, currentEquity: 99_000, equityAsOf: at(TOTAL_LOSS_MAX_EQUITY_AGE_MINUTES + 1) });
    assert.equal(stale.status, "unknown");
    assert.match(stale.status === "unknown" ? stale.detail : "", /31 min old/);
  });

  it("an equity from days ago (sync down, weekend gap) cannot say the account is fine", () => {
    // 5 days old, healthy-looking figure — the account may be past its floor now.
    const d = evaluateTotalLoss({ ...staticInput, currentEquity: 99_000, equityAsOf: at(5 * 24 * 60) });
    assert.equal(d.status, "unknown");
  });

  it("a missing, unparseable or future timestamp is unknown", () => {
    for (const t of [null, undefined, "not a date", at(-60)]) {
      assert.equal(evaluateTotalLoss({ ...staticInput, currentEquity: 99_000, equityAsOf: t }).status, "unknown");
    }
  });

  it("a stale breach is still refused (unknown) — it never reads as ok", () => {
    assert.equal(evaluateTotalLoss({ ...staticInput, currentEquity: 80_000, equityAsOf: at(600) }).status, "unknown");
  });
});

describe("freshestEquity / liveEquityReading", () => {
  it("picks the newest usable reading, so a stale snapshot row cannot mask a fresher live state", () => {
    const best = freshestEquity([
      { equity: 100_000, at: "2026-04-21T08:18:25.195Z" },
      { equity: 91_000, at: "2026-11-11T11:58:00Z" },
    ]);
    assert.equal(best?.equity, 91_000);
  });

  it("skips readings without positive equity or a valid timestamp", () => {
    assert.equal(freshestEquity([{ equity: null, at: NOW }, { equity: 5, at: null }, { equity: 0, at: NOW }, { equity: 5, at: "x" }]), null);
    assert.equal(freshestEquity([]), null);
  });

  it("reads equity (else balance) and updatedAt from liveAccountState", () => {
    assert.deepEqual(liveEquityReading({ liveAccountState: { equity: 91_000, balance: 92_000, updatedAt: "2026-11-11T11:58:00Z" } }), {
      equity: 91_000,
      at: "2026-11-11T11:58:00Z",
    });
    assert.equal(liveEquityReading({ liveAccountState: { balance: 92_000, updatedAt: "t" } }).equity, 92_000);
    assert.deepEqual(liveEquityReading(null), { equity: null, at: null });
    assert.deepEqual(liveEquityReading({}), { equity: null, at: null });
  });
});

describe("livePeakBalance", () => {
  it("reads liveAccountState.peakBalance and nothing else", () => {
    assert.equal(livePeakBalance({ liveAccountState: { peakBalance: 105_000 } }), 105_000);
    assert.equal(livePeakBalance({ liveAccountState: { peakBalance: 0 } }), null);
    assert.equal(livePeakBalance({ peakBalance: 5 }), null);
    assert.equal(livePeakBalance(null), null);
    assert.equal(livePeakBalance([]), null);
  });
});

/* ── the guard ─────────────────────────────────────────────────────────── */

const funded2Step = buildAccountProfile({
  label: "FTMO 2-Step Funded 100K",
  mt5Server: "FTMO-Server",
  metadata: { firmModel: "2-Step" },
});
const live = buildAccountProfile({ label: "MT5 LIVE", mt5Server: "ICMarkets-Live" });

const guardBase = (over: Partial<AutoTradeGuardInput> = {}): AutoTradeGuardInput => ({
  profile: funded2Step,
  volumeLots: 0.1,
  openPositions: 0,
  autoTradesToday: 0,
  dayResultPct: 0,
  totalLoss: { status: "ok", usedPct: 0, limitPct: 10 },
  minutesToHighImpact: null,
  now: NOW,
  ...over,
});

describe("evaluateAutoTrade — total loss", () => {
  it("fixture: 2-Step funded has a static 10% total limit", () => {
    assert.equal(funded2Step.maxTotalLossPct, 10);
    assert.equal(funded2Step.maxTotalLossBasis, "initial_balance");
    assert.equal(evaluateAutoTrade(guardBase()).allowed, true);
  });

  it("an unattended trade is blocked when the account is at its total loss limit", () => {
    const totalLoss = evaluateTotalLoss({ ...staticInput, currentEquity: 90_000 });
    const d = evaluateAutoTrade(guardBase({ totalLoss }));
    assert.equal(d.allowed, false);
    assert.equal(!d.allowed && d.reason, "total_loss_reached");
    assert.match(!d.allowed ? d.detail : "", /maximum total loss is 10%/);
  });

  it("unknown total loss fails closed when the account has a limit", () => {
    const unknown = evaluateTotalLoss({ ...staticInput, currentEquity: null });
    const d = evaluateAutoTrade(guardBase({ totalLoss: unknown }));
    assert.equal(!d.allowed && d.reason, "total_loss_unknown");
  });

  it("a caller that forgets to check total loss is refused, not waved through", () => {
    const d = evaluateAutoTrade(guardBase({ totalLoss: undefined }));
    assert.equal(!d.allowed && d.reason, "total_loss_unknown");
    assert.match(!d.allowed ? d.detail : "", /did not check/);
    assert.equal(!evaluateAutoTrade(guardBase({ totalLoss: null })).allowed, true);
  });

  it("a manually confirmed order keeps current behaviour: not blocked by total loss", () => {
    const reached = evaluateTotalLoss({ ...staticInput, currentEquity: 85_000 });
    assert.equal(evaluateAutoTrade(guardBase({ totalLoss: reached, attended: true })).allowed, true);
    assert.equal(evaluateAutoTrade(guardBase({ totalLoss: undefined, attended: true })).allowed, true);
  });

  it("an account without a total limit (live) is not blocked, with or without a reading", () => {
    assert.equal(live.maxTotalLossPct, null);
    assert.equal(evaluateAutoTrade(guardBase({ profile: live, totalLoss: undefined })).allowed, true);
  });

  it("a healthy account trades", () => {
    const totalLoss = evaluateTotalLoss({ ...staticInput, currentEquity: 98_000 });
    assert.equal(evaluateAutoTrade(guardBase({ totalLoss })).allowed, true);
  });

  it("news and weekend rules still come before the total loss check (account rules first)", () => {
    const reached = evaluateTotalLoss({ ...staticInput, currentEquity: 85_000 });
    const d = evaluateAutoTrade(guardBase({ totalLoss: reached, minutesToHighImpact: 5 }));
    assert.equal(!d.allowed && d.reason, "news_restricted");
  });

  it("total loss is reported before the daily loss when both are breached", () => {
    const reached = evaluateTotalLoss({ ...staticInput, currentEquity: 85_000 });
    const d = evaluateAutoTrade(guardBase({ totalLoss: reached, dayResultPct: -9 }));
    assert.equal(!d.allowed && d.reason, "total_loss_reached");
  });

  it("a trailing-model account (FTMO Instant) blocks on the drop from its peak", () => {
    const instant = buildAccountProfile({ label: "FTMO Instant", mt5Server: "FTMO-Server", metadata: { firmModel: "Instant" } });
    assert.equal(instant.maxTotalLossBasis, "trailing_peak_balance");
    const totalLoss = evaluateTotalLoss({
      equityAsOf: FRESH,
      now: NOW,
      maxTotalLossPct: instant.maxTotalLossPct,
      basis: instant.maxTotalLossBasis,
      currentEquity: 97_000,
      accountSize: 100_000,
      initialBalance: 100_000,
      peakBalance: 108_000,
    });
    assert.equal(evaluateAutoTrade(guardBase({ profile: instant, totalLoss })).allowed, false);
  });
});

describe("dailyLossReference applies the same account-size ceiling", () => {
  it("an impossible stated size (>10M) is not used as the daily-loss base", () => {
    const ref = dailyLossReference({ dayStartBase: 100_000, basis: "day_start_balance", accountSize: 20_000_000 });
    assert.equal(ref, 100_000);
    assert.equal(
      dailyLossReference({ dayStartBase: 110_000, basis: "day_start_balance", accountSize: 100_000 }),
      100_000,
    );
  });
});
