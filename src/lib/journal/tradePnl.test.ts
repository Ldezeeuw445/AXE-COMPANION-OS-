import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { netPnl, signedFees, sumLedger } from "./tradePnl";

describe("tradePnl", () => {
  it("adds signed fees instead of subtracting abs(fees)", () => {
    assert.equal(netPnl(120, -8.5), 111.5);
    assert.equal(netPnl(-40, -2), -42);
    assert.equal(netPnl(10, 3), 13, "a credit swap must increase net, not shrink it");
    assert.equal(signedFees("-1.25"), -1.25);
  });

  it("treats non-finite input as zero", () => {
    assert.equal(netPnl(Number.NaN, null), 0);
    assert.equal(netPnl("12" as unknown as number, undefined), 12);
  });

  it("classifies wins and losses on net, not gross", () => {
    const ledger = sumLedger([
      { pnl: 12, fees: -15 },
      { pnl: 20, fees: -1 },
      { pnl: 0, fees: 0 },
    ]);
    assert.equal(ledger.tradeCount, 3);
    assert.equal(ledger.grossPnl, 32);
    assert.equal(ledger.fees, -16);
    assert.equal(ledger.netPnl, 16);
    assert.equal(ledger.wins, 1);
    assert.equal(ledger.losses, 1);
    assert.equal(ledger.scratches, 1);
    assert.equal(ledger.winRate, 0.5);
  });
});
