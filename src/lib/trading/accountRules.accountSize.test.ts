import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAccountProfile } from "@/lib/risk/accountProfile";
import { dailyLossReference, statedAccountSize } from "@/lib/risk/dailyLoss";
import { readingForKind } from "@/lib/risk/drawdownAlert";
import { liveEquitySnapshotFromMetadata } from "@/lib/mt5/liveAccountSnapshot";
import {
  EMPTY_ACCOUNT_RULES,
  MAX_ACCOUNT_SIZE_CEILING,
  hasAnyRule,
  parseAccountRules,
  rulesFromMetadata,
  withTradingRules,
} from "./accountRules";

const ftmo = {
  maxDailyLossPct: 5,
  maxDailyLossBasis: "day_start_balance" as const,
  maxTotalLossPct: 10,
  maxTotalLossBasis: "initial_balance" as const,
};

describe("account size: parsing and storage", () => {
  it("accepts a positive amount, from a number or a typed string", () => {
    assert.equal(parseAccountRules({ accountSize: 100000 }).accountSize, 100000);
    assert.equal(parseAccountRules({ accountSize: "200000" }).accountSize, 200000);
  });

  it("drops garbage and over-ceiling values instead of clamping them", () => {
    for (const bad of [0, -5, "abc", null, "", NaN, MAX_ACCOUNT_SIZE_CEILING + 1, 1e12]) {
      assert.equal(parseAccountRules({ accountSize: bad }).accountSize, null, String(bad));
    }
    assert.equal(parseAccountRules({ accountSize: MAX_ACCOUNT_SIZE_CEILING }).accountSize, MAX_ACCOUNT_SIZE_CEILING);
  });

  it("is stored beside firmModel, not inside tradingRules (it is not a stated limit)", () => {
    const meta = withTradingRules({ region: "london" }, { ...EMPTY_ACCOUNT_RULES, accountSize: 100000 });
    assert.equal(meta.accountSize, 100000);
    assert.equal(meta.tradingRules, undefined);
    assert.equal(meta.region, "london", "other metadata is untouched");
  });

  it("clearing it removes the key; a limit stated alongside survives", () => {
    const withSize = withTradingRules({}, { ...EMPTY_ACCOUNT_RULES, accountSize: 50000, maxDailyLossPct: 4 });
    assert.deepEqual(withSize.tradingRules, { maxDailyLossPct: 4 });
    const cleared = withTradingRules(withSize, { ...EMPTY_ACCOUNT_RULES, maxDailyLossPct: 4 });
    assert.equal("accountSize" in cleared, false);
  });

  it("stating only the size does not make the profile claim explicit limits", () => {
    const meta = withTradingRules({}, { ...EMPTY_ACCOUNT_RULES, accountSize: 100000 });
    const profile = buildAccountProfile({
      label: "FTMO 100k",
      mt5Server: "FTMO-Server",
      metadata: meta,
      connectionMethod: "metaapi",
    });
    assert.equal(profile.explicit, false);
  });

  it("counts as a stated value", () => {
    assert.equal(hasAnyRule({ ...EMPTY_ACCOUNT_RULES, accountSize: 1000 }), true);
  });

  it("rulesFromMetadata round-trips size AND firmModel (a reload must not lose them)", () => {
    const meta = withTradingRules(
      {},
      { ...EMPTY_ACCOUNT_RULES, accountSize: 100000, firmModel: "2-Step", maxLot: 5 },
    );
    const back = rulesFromMetadata(meta);
    assert.equal(back.accountSize, 100000);
    assert.equal(back.firmModel, "2-Step");
    assert.equal(back.maxLot, 5);
    assert.deepEqual(rulesFromMetadata(null), EMPTY_ACCOUNT_RULES);
  });
});

describe("account size: feeds the daily-loss base", () => {
  it("statedAccountSize reads what the panel writes", () => {
    const meta = withTradingRules({}, { ...EMPTY_ACCOUNT_RULES, accountSize: 100000 });
    assert.equal(statedAccountSize(meta), 100000);
  });

  it("FTMO-style: the stated size is the base, not the (higher) inferred first balance", () => {
    const base = dailyLossReference({
      dayStartBase: 110_000,
      basis: "day_start_balance",
      accountSize: 100_000,
      inferredInitialBalance: 108_000,
    });
    assert.equal(base, 100_000);
  });

  it("without a stated size the fallback is unchanged (never looser than the anchor)", () => {
    assert.equal(
      dailyLossReference({ dayStartBase: 110_000, basis: "day_start_balance", inferredInitialBalance: 108_000 }),
      108_000,
    );
  });

  it("explicit day_start_equity firms ignore the size and keep the anchor", () => {
    assert.equal(
      dailyLossReference({ dayStartBase: 110_000, basis: "day_start_equity", accountSize: 100_000 }),
      110_000,
    );
  });

  it("live snapshot carries the stated size into the drawdown alert, which then hits 100% at exactly $5,000", () => {
    const meta = {
      ...withTradingRules({}, { ...EMPTY_ACCOUNT_RULES, accountSize: 100000 }),
      liveAccountState: { dayStartBalance: 110000, dayStartEquity: 110000, initialBalance: 108000 },
    };
    const snap = liveEquitySnapshotFromMetadata(meta, { balance: 110000, equity: 105000 });
    assert.ok(snap);
    assert.equal(snap.accountSize, 100000);
    const reading = readingForKind("daily", ftmo, snap);
    assert.ok(reading);
    assert.equal(reading.loss, 5000);
    assert.equal(Math.round(reading.usedPct * 100) / 100, 5, "5% of $100k = $5,000 exactly");
  });

  it("the same account with no stated size reads the looser inferred base (unchanged fallback)", () => {
    const meta = {
      liveAccountState: { dayStartBalance: 110000, dayStartEquity: 110000, initialBalance: 108000 },
    };
    const snap = liveEquitySnapshotFromMetadata(meta, { balance: 110000, equity: 105000 });
    assert.ok(snap);
    assert.equal(snap.accountSize, null);
    const reading = readingForKind("daily", ftmo, snap);
    assert.ok(reading);
    assert.equal(Math.round(reading.usedPct * 100) / 100, Math.round((5000 / 108000) * 10000) / 100);
  });
});
