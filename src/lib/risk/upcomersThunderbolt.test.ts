/**
 * Upcomers Thunderbolt (1 step) in the guard: 3% daily from the higher of
 * balance/equity at the reset, 6% trailing max drawdown, both of the account
 * size — the same rulebook and the same numbers as the Trading OS funded suite
 * (fixture: Luka's 100K account on 27 Nov 2026, 2,705.55 daily room and
 * 3,473.97 max-drawdown room).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccountProfile, detectFirm } from "./accountProfile";
import { SHARED_PROP_PROGRAMS } from "./sharedPropPrograms";
import { dailyLossReference } from "./dailyLoss";
import { evaluateTotalLoss } from "./totalLoss";
import { readingForKind } from "./drawdownAlert";
import { amountForBasis } from "../trading/positionPlan";

const LUKA = {
  label: "100K 1STEP UPCOMERS",
  mt5Server: "Upcomers-Server",
  metadata: { firmModel: "Thunderbolt (1 step)", tradingRules: { accountSize: 100_000 } },
};
const NOW = new Date("2026-11-27T14:55:00Z");
const SNAP = {
  equity: 97_473.97,
  balance: 97_473.97,
  dayStartBalance: 97_768.42,
  dayStartEquity: 97_768.42,
  initialBalance: 99_828.25,
  peakBalance: 99_828.25,
  accountSize: 100_000,
};

test("Thunderbolt is picked from the label/model and its rules come from the shared catalog", () => {
  const firm = detectFirm(LUKA);
  assert.equal(firm?.id, "upcomers");
  assert.equal(firm?.model, "Thunderbolt");
  const catalog = SHARED_PROP_PROGRAMS["upcomers-thunderbolt-challenge"]!;
  assert.equal(firm?.rules?.maxDailyLossPct, catalog.dailyPct);
  assert.equal(firm?.rules?.maxTotalLossPct, catalog.maxPct);
  assert.equal(firm?.rules?.maxDailyLossPct, 3);
  assert.equal(firm?.rules?.maxTotalLossPct, 6);
  assert.equal(firm?.rules?.maxDailyLossBasis, "day_start_higher_of_balance_equity");
  assert.equal(firm?.rules?.maxTotalLossBasis, "trailing_peak_from_size");
  // The label alone ("1STEP") is enough, without the chosen model.
  assert.equal(detectFirm({ label: "100K 1STEP UPCOMERS", mt5Server: "Upcomers-Server" })?.model, "Thunderbolt");
});

test("Luka's account: guard uses 3% daily (not the Oracle 4% fallback) and the firm's 6% trailing max drawdown", () => {
  const p = buildAccountProfile(LUKA);
  assert.equal(p.maxDailyLossPct, 3);
  assert.equal(p.maxDailyLossBasis, "day_start_higher_of_balance_equity");
  assert.equal(p.maxTotalLossPct, 6);
  assert.equal(p.maxTotalLossBasis, "trailing_peak_from_size");
  assert.equal(p.provenance.maxDailyLossPct, "firm");
  assert.equal(p.provenance.maxTotalLossPct, "firm");
  assert.equal(p.newsTradingAllowed, true);
  assert.equal(p.weekendHoldingAllowed, true);
});

test("a stated total-loss % still drops the firm's basis (unknown → no automatic order), as for every firm", () => {
  const p = buildAccountProfile({ ...LUKA, metadata: { ...LUKA.metadata, tradingRules: { maxTotalLossPct: 6 } } });
  assert.equal(p.maxTotalLossPct, 6);
  assert.equal(p.maxTotalLossBasis, null);
  assert.equal(p.maxDailyLossPct, 3, "the daily rule still comes from the firm");
});

test("Oracle is unchanged; an Upcomers account without a model gets the tightest daily (3%)", () => {
  const oracle = detectFirm({ label: "Upcomers Oracle 50K", mt5Server: "Upcomers-Server" });
  assert.equal(oracle?.model, "Oracle");
  assert.equal(oracle?.rules?.maxDailyLossPct, 4);
  const unknown = detectFirm({ label: "Upcomers 50K", mt5Server: "Upcomers-Server" });
  assert.equal(unknown?.model, null);
  assert.equal(unknown?.rules?.maxDailyLossPct, 3);
  assert.equal(unknown?.rulesAreTightestAcrossModels, true);
  assert.deepEqual(unknown?.unresolvedModels, ["Oracle", "Thunderbolt"]);
});

test("daily: 3% of the account size, measured from the higher of balance/equity at the reset = TOS 2,705.55 room", () => {
  assert.equal(dailyLossReference({ dayStartBase: 97_768.42, basis: "day_start_higher_of_balance_equity", accountSize: 100_000 }), 100_000);
  const daily = readingForKind("daily", buildAccountProfile(LUKA), SNAP)!;
  assert.equal(daily.reference, 97_768.42);
  assert.ok(Math.abs(daily.loss - 294.45) < 0.005);
  const roomUsd = (daily.limitPct - daily.usedPct) * 1_000; // 1% of 100k = 1,000
  assert.ok(Math.abs(roomUsd - 2_705.55) < 0.01, `room ${roomUsd}`);
  // Higher of the two: equity above balance at the reset is the anchor.
  const higher = readingForKind("daily", buildAccountProfile(LUKA), { ...SNAP, dayStartEquity: 98_000 })!;
  assert.equal(higher.reference, 98_000);
  // No stated size: never looser than measuring 3% of the anchor or first balance.
  assert.equal(dailyLossReference({ dayStartBase: 97_768.42, basis: "day_start_higher_of_balance_equity", inferredInitialBalance: 99_828.25 }), 97_768.42);
});

test("max drawdown: 6% trailing from max(size, highest balance) = TOS 3,473.97 room; unknown without a stated size", () => {
  const ok = evaluateTotalLoss({
    maxTotalLossPct: 6,
    basis: "trailing_peak_from_size",
    currentEquity: 97_473.97,
    equityAsOf: NOW,
    now: NOW,
    accountSize: 100_000,
    peakBalance: 99_828.25,
    initialBalance: 99_828.25,
  });
  assert.equal(ok.status, "ok");
  const roomUsd = (6 - (ok.usedPct ?? 0)) * 1_000;
  assert.ok(Math.abs(roomUsd - 3_473.97) < 0.01, `room ${roomUsd}`);

  const blocked = evaluateTotalLoss({
    maxTotalLossPct: 6,
    basis: "trailing_peak_from_size",
    currentEquity: 94_500,
    equityAsOf: NOW,
    now: NOW,
    accountSize: 100_000,
    peakBalance: 99_828.25,
  });
  assert.equal(blocked.status, "blocked");

  const noSize = evaluateTotalLoss({
    maxTotalLossPct: 6,
    basis: "trailing_peak_from_size",
    currentEquity: 97_473.97,
    equityAsOf: NOW,
    now: NOW,
    initialBalance: 99_828.25,
    peakBalance: 99_828.25,
  });
  assert.equal(noSize.status, "unknown");

  const total = readingForKind("total", buildAccountProfile(LUKA), SNAP)!;
  assert.equal(total.reference, 100_000);
  assert.ok(Math.abs((total.limitPct - total.usedPct) * 1_000 - 3_473.97) < 0.01);
  assert.equal(readingForKind("total", buildAccountProfile(LUKA), { ...SNAP, accountSize: null }), null);
});

test("position plan reads the same amounts", () => {
  assert.equal(amountForBasis("day_start_higher_of_balance_equity", { dayStartBalance: 97_768.42, dayStartEquity: 98_000 }), 98_000);
  assert.equal(amountForBasis("trailing_peak_from_size", { accountSize: 100_000, trailingPeakBalance: 99_828.25 }), 100_000);
  assert.equal(amountForBasis("trailing_peak_from_size", { initialBalance: 99_828.25, trailingPeakBalance: 99_828.25 }), null);
});
