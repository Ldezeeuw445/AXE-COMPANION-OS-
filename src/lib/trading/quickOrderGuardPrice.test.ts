import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAccountProfile } from "@/lib/risk/accountProfile";
import { pointValuePerLot } from "@/lib/risk/accountRiskBand";
import { evaluateAutoTrade } from "@/lib/trading/autoTradeGuard";
import { tradeRiskPct } from "@/lib/trading/autonomyRisk";
import { quickOrderGuardEntryPrice } from "@/lib/trading/quickOrderGuardPrice";

const liveProfile = buildAccountProfile({ label: "ICMarkets LIVE", mt5Server: "ICMarkets-Live" });
// Tuesday midday, well away from the weekend edge.
const now = new Date("2026-11-10T15:00:00Z");

/** Mirror of the second guard call inside placeMt5QuickOrder. */
function secondGuard(args: {
  orderType: "market" | "buy_limit" | "sell_limit";
  openPrice?: number | null;
  riskReferencePrice?: number | null;
  stopLoss: number;
  volumeLots: number;
}) {
  const entryPrice = quickOrderGuardEntryPrice(args);
  const riskPct = tradeRiskPct({
    entryPrice,
    stopLoss: args.stopLoss,
    volumeLots: args.volumeLots,
    equity: 10_000,
    pointValuePerLot: pointValuePerLot("XAUUSD"),
  });
  return evaluateAutoTrade({
    profile: liveProfile,
    volumeLots: args.volumeLots,
    openPositions: 0,
    autoTradesToday: 0,
    dayResultPct: 0,
    minutesToHighImpact: null,
    now,
    attended: false,
    userMaxLot: 5,
    userMaxRiskPct: 1,
    userMaxTradesPerDay: 6,
    riskPct,
  });
}

describe("quickOrderGuardEntryPrice", () => {
  it("market alert order within the risk cap is not refused as risk_unknown", () => {
    // 0.1 lot XAU, 5$ stop = $50 = 0.5% of 10k, under the 1% cap.
    const decision = secondGuard({
      orderType: "market",
      riskReferencePrice: 2000,
      stopLoss: 1995,
      volumeLots: 0.1,
    });
    assert.deepEqual(decision, { allowed: true });
  });

  it("market order over the risk cap is still blocked on risk, not on unknown", () => {
    const decision = secondGuard({
      orderType: "market",
      riskReferencePrice: 2000,
      stopLoss: 1980,
      volumeLots: 0.1,
    });
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.reason, "risk_above_limit");
  });

  it("market order without a reference price still fails closed", () => {
    const decision = secondGuard({ orderType: "market", stopLoss: 1995, volumeLots: 0.1 });
    assert.equal(!decision.allowed && decision.reason, "risk_unknown");
  });

  it("pending orders use the open price, never the reference price", () => {
    assert.equal(
      quickOrderGuardEntryPrice({ orderType: "buy_limit", openPrice: 1990, riskReferencePrice: 2000 }),
      1990,
    );
    assert.equal(quickOrderGuardEntryPrice({ orderType: "market", openPrice: 1990 }), null);
    assert.equal(quickOrderGuardEntryPrice({ orderType: "market", riskReferencePrice: Number.NaN }), null);
    assert.equal(quickOrderGuardEntryPrice({ orderType: "sell_limit", openPrice: 0 }), null);
  });
});
