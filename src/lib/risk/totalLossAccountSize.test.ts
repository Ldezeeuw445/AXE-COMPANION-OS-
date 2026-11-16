import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateDrawdownAlerts, readingForKind, type LiveEquitySnapshot } from "./drawdownAlert";
import { STATED_ACCOUNT_SIZE_CEILING, statedAccountSize } from "./dailyLoss";
import { MAX_ACCOUNT_SIZE_CEILING } from "../trading/accountRules";
import { liveEquitySnapshotFromMetadata } from "../mt5/liveAccountSnapshot";
import type { TradingConstraints } from "./accountProfile";

/** FTMO-style: 5% daily of the day-start balance, 10% total of the starting balance. */
const ftmo: Pick<
  TradingConstraints,
  "maxDailyLossPct" | "maxDailyLossBasis" | "maxTotalLossPct" | "maxTotalLossBasis"
> = {
  maxDailyLossPct: 5,
  maxDailyLossBasis: "day_start_balance",
  maxTotalLossPct: 10,
  maxTotalLossBasis: "initial_balance",
};

function snap(over: Partial<LiveEquitySnapshot>): LiveEquitySnapshot {
  return {
    equity: 100_000,
    balance: 100_000,
    dayStartBalance: 100_000,
    dayStartEquity: 100_000,
    initialBalance: 100_000,
    peakBalance: 100_000,
    accountSize: null,
    ...over,
  };
}

describe("total loss is measured from the stated account size", () => {
  it("account connected while in drawdown: total loss counts from the real $100k, not the first balance AXE saw", () => {
    // AXE first saw $95k; the firm's floor is $90k (10% of $100k). At $91k
    // 90% of the total limit is used — the old base ($95k) reported 42%.
    const s = snap({ equity: 91_000, balance: 91_000, dayStartBalance: 91_000, initialBalance: 95_000, peakBalance: 95_000, accountSize: 100_000 });
    const r = readingForKind("total", ftmo, s);
    assert.ok(r);
    assert.equal(r.reference, 100_000);
    assert.equal(r.loss, 9_000);
    assert.equal(Math.round(r.ofLimitPct), 90);
    const alerts = evaluateDrawdownAlerts({ accountId: "a", constraints: ftmo, snap: s, dayStamp: "2026-11-16" });
    const total = alerts.find((a) => a.kind === "total");
    assert.ok(total, "total drawdown alert must fire");
    assert.equal(total.band, 85);
  });

  it("past the firm's floor is reported as the 100% band", () => {
    const s = snap({ equity: 89_500, balance: 89_500, dayStartBalance: 89_500, initialBalance: 92_000, peakBalance: 92_000, accountSize: 100_000 });
    const total = evaluateDrawdownAlerts({ accountId: "a", constraints: ftmo, snap: s, dayStamp: "2026-11-16" }).find(
      (a) => a.kind === "total",
    );
    assert.ok(total);
    assert.equal(total.band, 100);
  });

  it("account connected while in profit: the loss is from the account size, not from a profit high-water mark", () => {
    const s = snap({ equity: 95_000, balance: 95_000, dayStartBalance: 95_000, initialBalance: 110_000, peakBalance: 110_000, accountSize: 100_000 });
    const r = readingForKind("total", ftmo, s);
    assert.ok(r);
    assert.equal(r.reference, 100_000);
    assert.equal(r.loss, 5_000);
    assert.equal(r.usedPct, 5);
  });

  it("without an account size the behaviour is unchanged (inferred initial balance)", () => {
    const s = snap({ equity: 91_000, balance: 91_000, initialBalance: 95_000, peakBalance: 95_000, accountSize: null });
    const r = readingForKind("total", ftmo, s);
    assert.ok(r);
    assert.equal(r.reference, 95_000);
    // and without anything inferred: highest known balance, as before
    const r2 = readingForKind("total", ftmo, snap({ equity: 91_000, balance: 92_000, dayStartBalance: 93_000, initialBalance: null, peakBalance: 96_000 }));
    assert.ok(r2);
    assert.equal(r2.reference, 96_000);
  });

  it("an invalid account size (0, negative, NaN, above the 10M ceiling) is ignored", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 20_000_000]) {
      const r = readingForKind("total", ftmo, snap({ equity: 91_000, balance: 91_000, initialBalance: 95_000, accountSize: bad }));
      assert.ok(r, `reading for ${bad}`);
      assert.equal(r.reference, 95_000, `accountSize ${bad} must fall back to the inferred base`);
    }
  });

  it("trailing bases do not use the account size", () => {
    const r = readingForKind(
      "total",
      { ...ftmo, maxTotalLossBasis: "trailing_peak_balance" },
      snap({ equity: 100_000, balance: 100_000, peakBalance: 104_000, accountSize: 100_000 }),
    );
    assert.ok(r);
    assert.equal(r.reference, 104_000);
  });
});

describe("statedAccountSize respects the same ceiling as the settings panel", () => {
  it("shares the 10M ceiling with accountRules", () => {
    assert.equal(STATED_ACCOUNT_SIZE_CEILING, MAX_ACCOUNT_SIZE_CEILING);
  });

  it("drops an impossible account size instead of using it as a base", () => {
    assert.equal(statedAccountSize({ tradingRules: { accountSize: 20_000_000 } }), null);
    assert.equal(statedAccountSize({ accountSize: 10_000_001 }), null);
    assert.equal(statedAccountSize({ accountSize: 10_000_000 }), 10_000_000);
    assert.equal(statedAccountSize({ tradingRules: { accountSize: 200_000 } }), 200_000);
  });
});

describe("watcher snapshot → drawdown alert (metadata wiring)", () => {
  it("uses metadata.tradingRules.accountSize for the total loss check", () => {
    const metadata = {
      tradingRules: { accountSize: 100_000, maxTotalLossPct: 10 },
      liveAccountState: { initialBalance: 95_000, dayStartBalance: 91_000, dayStartEquity: 91_000, peakBalance: 95_000 },
    };
    const s = liveEquitySnapshotFromMetadata(metadata, { balance: 91_000, equity: 90_500 } as never);
    assert.ok(s);
    assert.equal(s.accountSize, 100_000);
    const total = evaluateDrawdownAlerts({ accountId: "a", constraints: ftmo, snap: s, dayStamp: "2026-11-16" }).find(
      (a) => a.kind === "total",
    );
    assert.ok(total, "total drawdown alert must fire at 95% of the limit");
    assert.equal(total.band, 95);
    assert.equal(total.reading.reference, 100_000);
  });
});
