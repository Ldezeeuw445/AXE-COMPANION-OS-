import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readAccountSnapshot,
  reconcileAccountLedger,
  TRADING_OS_C1_CAVEAT,
} from "./reconcileAccountLedger";

describe("reconcileAccountLedger", () => {
  it("adds stored trades with signed fees and refuses to invent a cash ledger", () => {
    const ledger = reconcileAccountLedger({
      accountId: "acct-1",
      trades: [
        { pnl: 100, fees: -6 },
        { pnl: -20, fees: -1 },
      ],
      snapshot: { balance: 10400, equity: 10390, currency: "USD" },
    });
    assert.equal(ledger.netPnl, 73);
    assert.equal(ledger.balance, 10400);
    assert.equal(ledger.hasBothViews, true);
    assert.equal(ledger.canReconcileToBalance, false);
    assert.equal(ledger.caveat, TRADING_OS_C1_CAVEAT);
  });

  it("reads MetaApi accountSummary from metadata without assuming deposits", () => {
    const snap = readAccountSnapshot({
      accountSummary: { balance: "2500.5", equity: 2490, currency: "eur" },
    });
    assert.equal(snap.balance, 2500.5);
    assert.equal(snap.equity, 2490);
    assert.equal(snap.currency, "EUR");
    assert.deepEqual(readAccountSnapshot({}), {
      balance: null,
      equity: null,
      currency: null,
    });
  });
});
