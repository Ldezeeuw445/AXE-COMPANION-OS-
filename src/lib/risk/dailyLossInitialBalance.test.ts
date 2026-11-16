import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as dailyLoss from "./dailyLoss";
import { readingForKind } from "./drawdownAlert";
import type { TradingConstraints } from "./accountProfile";

/*
 * FTMO-style daily loss: X% of the INITIAL balance (account size), measured
 * from the day-start anchor. % of the day-start figure is looser whenever the
 * account is in profit — the guard and the alert then fire past the firm's
 * real limit. Namespace import so a missing helper fails per test, not the file.
 */

type Fn = (...args: never[]) => unknown;
function helper<T extends Fn>(name: string): T {
  const fn = (dailyLoss as Record<string, unknown>)[name];
  assert.equal(typeof fn, "function", `dailyLoss.${name} must exist`);
  return fn as T;
}

const ftmo2Step: Pick<
  TradingConstraints,
  "maxDailyLossPct" | "maxDailyLossBasis" | "maxTotalLossPct" | "maxTotalLossBasis"
> = {
  maxDailyLossPct: 5,
  maxDailyLossBasis: "day_start_balance",
  maxTotalLossPct: 10,
  maxTotalLossBasis: "initial_balance",
};

describe("daily loss allowance on a $100k account in profit (day start $110k)", () => {
  it("guard blocks a $5,000 day loss: 5% of $100k, not 5% of $110k", () => {
    // 110k -> 105.5k = -$4,500 = 4.5% of 100k (at the 0.5% buffer), only 4.09% of 110k.
    const d = dailyLoss.evaluateDailyLoss({
      startEquity: 110_000,
      currentEquity: 105_500,
      maxDailyLossPct: 5,
      referenceBase: 100_000,
    } as Parameters<typeof dailyLoss.evaluateDailyLoss>[0]);
    assert.equal(d.status, "blocked");
  });

  it("guard reports the day result as a % of the account size", () => {
    const d = dailyLoss.evaluateDailyLoss({
      startEquity: 110_000,
      currentEquity: 107_000,
      maxDailyLossPct: 5,
      referenceBase: 100_000,
    } as Parameters<typeof dailyLoss.evaluateDailyLoss>[0]);
    assert.equal(d.status, "ok");
    if (d.status === "ok") assert.equal(Number(d.dayResultPct.toFixed(6)), -3);
  });

  it("drawdown alert hits 100% of the daily limit at -$5,000 from the day start", () => {
    const reading = readingForKind("daily", ftmo2Step, {
      equity: 105_000,
      balance: 105_000,
      dayStartBalance: 110_000,
      dayStartEquity: 110_000,
      initialBalance: 100_000,
      peakBalance: 110_000,
    });
    assert.ok(reading);
    assert.equal(Number(reading.usedPct.toFixed(6)), 5);
    assert.equal(Math.round(reading.ofLimitPct), 100);
    // Still measured from the day-start anchor.
    assert.equal(reading.reference, 110_000);
    assert.equal(reading.loss, 5_000);
  });

  it("drawdown alert warns at 70% after a $3,500 loss", () => {
    const reading = readingForKind("daily", ftmo2Step, {
      equity: 106_500,
      balance: 106_500,
      dayStartBalance: 110_000,
      dayStartEquity: 110_000,
      initialBalance: 100_000,
      peakBalance: 110_000,
    });
    assert.ok(reading);
    assert.equal(Math.round(reading.ofLimitPct), 70);
  });
});

describe("dailyLossReference", () => {
  type Ref = (input: {
    dayStartBase: number | null | undefined;
    basis: string | null | undefined;
    accountSize?: number | null;
    inferredInitialBalance?: number | null;
  }) => number | null;

  it("uses the stated account size for FTMO-style rules", () => {
    const ref = helper<Ref>("dailyLossReference");
    assert.equal(ref({ dayStartBase: 110_000, basis: "day_start_balance", accountSize: 100_000 }), 100_000);
    // In drawdown the firm still allows X% of the account size from the day start.
    assert.equal(ref({ dayStartBase: 95_000, basis: "day_start_balance", accountSize: 100_000 }), 100_000);
  });

  it("never looser than the day-start anchor when only an inferred initial balance is known", () => {
    const ref = helper<Ref>("dailyLossReference");
    assert.equal(ref({ dayStartBase: 110_000, basis: "day_start_balance", inferredInitialBalance: 100_000 }), 100_000);
    // Connected while in profit: first-seen 112k is above today's anchor; keep the anchor.
    assert.equal(ref({ dayStartBase: 108_000, basis: "day_start_balance", inferredInitialBalance: 112_000 }), 108_000);
    assert.equal(ref({ dayStartBase: 108_000, basis: "day_start_balance" }), 108_000);
  });

  it("keeps an explicit day_start_equity firm rule (Upcomers Oracle) on the anchor", () => {
    const ref = helper<Ref>("dailyLossReference");
    assert.equal(
      ref({ dayStartBase: 210_000, basis: "day_start_equity", accountSize: 200_000, inferredInitialBalance: 200_000 }),
      210_000,
    );
  });

  it("unknown basis (trader-typed %) takes the smallest known base", () => {
    const ref = helper<Ref>("dailyLossReference");
    assert.equal(ref({ dayStartBase: 110_000, basis: null, accountSize: 100_000 }), 100_000);
    assert.equal(ref({ dayStartBase: 95_000, basis: null, accountSize: 100_000 }), 95_000);
    assert.equal(ref({ dayStartBase: 110_000, basis: null }), 110_000);
  });

  it("is null without a day-start anchor (caller fails closed)", () => {
    const ref = helper<Ref>("dailyLossReference");
    assert.equal(ref({ dayStartBase: null, basis: "day_start_balance", accountSize: 100_000 }), null);
  });
});

describe("account size from metadata", () => {
  it("reads a stated size, not the first observed balance", () => {
    const stated = helper<(m: unknown) => number | null>("statedAccountSize");
    const inferred = helper<(m: unknown) => number | null>("inferredInitialBalance");
    const meta = {
      tradingRules: { accountSize: 100_000 },
      liveAccountState: { initialBalance: 112_000 },
    };
    assert.equal(stated(meta), 100_000);
    assert.equal(inferred(meta), 112_000);
    assert.equal(stated({ liveAccountState: { initialBalance: 112_000 } }), null);
    assert.equal(stated(null), null);
    assert.equal(inferred({}), null);
  });

  it("day result is a % of the reference, measured from the anchor", () => {
    const pct = helper<(s: number, c: number, r: number) => number | null>("dayResultPctOfReference");
    assert.equal(pct(110_000, 105_000, 100_000), -5);
    assert.equal(pct(110_000, 105_000, 0), null);
  });
});
