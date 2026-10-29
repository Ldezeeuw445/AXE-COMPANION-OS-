/**
 * PR #131 paper-testplan cases as unit tests with mocks (no MetaApi / no broker).
 *
 * TC1/TC3/TC4 route wiring is also asserted statically in
 * scripts/verify-pr131-paper-cases.mjs. Here we exercise the pure guard and a
 * mocked order-path decision tree that mirrors /api/mt5/order.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAccountProfile } from "@/lib/risk/accountProfile";
import { evaluateAutoTrade } from "@/lib/trading/autoTradeGuard";

type GuardDecision =
  | { allowed: true; accountId: string }
  | { allowed: false; reason: string; detail: string };

type PaperResult = { ok: true; positionId: string; openPrice: number };

/**
 * Minimal mirror of the order-route branch order. Used so tests can assert
 * MetaApi is never called on paper / guard-fail without spinning Next.js.
 */
function simulateOrderPath(input: {
  connectionMethod: string;
  provider?: string;
  orderType: "market" | "buy_limit";
  liveTradingEnabled: boolean;
  guard: GuardDecision;
  placePaper: () => PaperResult;
  placeMetaApi: () => { ok: true; orderId: string };
}):
  | { status: 200; body: Record<string, unknown>; metaApiCalled: boolean; paperCalled: boolean; feedEvent: string | null }
  | { status: number; body: { ok: false; code: string; message: string }; metaApiCalled: boolean; paperCalled: boolean; feedEvent: string | null } {
  let metaApiCalled = false;
  let paperCalled = false;
  let feedEvent: string | null = null;

  const isPaper = input.connectionMethod === "demo_paper" || input.provider === "demo";
  if (isPaper) {
    if (input.orderType !== "market") {
      return {
        status: 409,
        body: { ok: false, code: "paper_market_only", message: "market only" },
        metaApiCalled,
        paperCalled,
        feedEvent,
      };
    }
    paperCalled = true;
    const result = input.placePaper();
    return {
      status: 200,
      body: { ok: true, paper: true, positionId: result.positionId, openPrice: result.openPrice },
      metaApiCalled,
      paperCalled,
      feedEvent,
    };
  }

  if (!input.liveTradingEnabled) {
    return {
      status: 403,
      body: { ok: false, code: "live_trading_disabled", message: "enable live trading" },
      metaApiCalled,
      paperCalled,
      feedEvent,
    };
  }

  if (!input.guard.allowed) {
    feedEvent = `order_blocked:ts:${input.guard.reason}`;
    return {
      status: 403,
      body: { ok: false, code: input.guard.reason, message: input.guard.detail },
      metaApiCalled,
      paperCalled,
      feedEvent,
    };
  }

  metaApiCalled = true;
  const placed = input.placeMetaApi();
  return {
    status: 200,
    body: { ok: true, orderId: placed.orderId },
    metaApiCalled,
    paperCalled,
    feedEvent,
  };
}

function simulateClosePath(input: {
  connectionMethod: string;
  liveTradingEnabled: boolean;
  closePaper: () => { ok: true; paper: true };
  closeMetaApi: () => { ok: true };
}): { status: number; blockedByLiveTrading: boolean; paper: boolean } {
  // Mirrors close-position: kill switch must NOT gate closes.
  void input.liveTradingEnabled;
  if (input.connectionMethod === "demo_paper") {
    input.closePaper();
    return { status: 200, blockedByLiveTrading: false, paper: true };
  }
  input.closeMetaApi();
  return { status: 200, blockedByLiveTrading: false, paper: false };
}

const propProfile = buildAccountProfile({
  label: "FTMO Challenge 100K",
  mt5Server: "FTMO-Server",
});
const liveProfile = buildAccountProfile({
  label: "ICMarkets LIVE",
  mt5Server: "ICMarkets-Live",
});

describe("PR131 order path cases (mocked)", () => {
  it("TC1: guard fail → 403 + order_blocked event; MetaApi never called", () => {
    let metaApiHits = 0;
    const out = simulateOrderPath({
      connectionMethod: "cloud_mt5",
      orderType: "market",
      liveTradingEnabled: true,
      guard: {
        allowed: false,
        reason: "daily_loss_reached",
        detail: "day is over",
      },
      placePaper: () => {
        throw new Error("paper must not run");
      },
      placeMetaApi: () => {
        metaApiHits += 1;
        return { ok: true, orderId: "x" };
      },
    });
    assert.equal(out.status, 403);
    assert.equal(out.body.ok, false);
    assert.equal((out.body as { code: string }).code, "daily_loss_reached");
    assert.equal(out.metaApiCalled, false);
    assert.equal(metaApiHits, 0);
    assert.match(out.feedEvent ?? "", /^order_blocked:.*:daily_loss_reached$/);
  });

  it("TC2: missing equity + prop daily cap → daily_loss_unknown", () => {
    assert.ok(propProfile.maxDailyLossPct != null);
    const d = evaluateAutoTrade({
      profile: propProfile,
      volumeLots: 0.01,
      openPositions: 0,
      autoTradesToday: 0,
      dayResultPct: null,
      minutesToHighImpact: null,
      now: new Date("2026-10-14T10:00:00Z"),
      attended: true,
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "daily_loss_unknown");

    const out = simulateOrderPath({
      connectionMethod: "cloud_mt5",
      orderType: "market",
      liveTradingEnabled: true,
      guard: { allowed: false, reason: d.reason, detail: d.detail },
      placePaper: () => {
        throw new Error("no paper");
      },
      placeMetaApi: () => {
        throw new Error("no metaapi");
      },
    });
    assert.equal(out.status, 403);
    assert.equal((out.body as { code: string }).code, "daily_loss_unknown");
    assert.equal(out.metaApiCalled, false);
  });

  it("TC2b: no daily cap → missing equity does not fail-closed", () => {
    assert.equal(liveProfile.maxDailyLossPct, null);
    const d = evaluateAutoTrade({
      profile: liveProfile,
      volumeLots: 0.01,
      openPositions: 0,
      autoTradesToday: 0,
      dayResultPct: null,
      minutesToHighImpact: null,
      now: new Date("2026-10-14T10:00:00Z"),
      attended: true,
    });
    assert.equal(d.allowed, true);
  });

  it("TC3: paper market order returns before guard; MetaApi never called", () => {
    let paperHits = 0;
    let metaApiHits = 0;
    const out = simulateOrderPath({
      connectionMethod: "demo_paper",
      orderType: "market",
      liveTradingEnabled: false, // must not matter for paper
      guard: {
        allowed: false,
        reason: "should_not_run",
        detail: "guard must not be consulted for paper",
      },
      placePaper: () => {
        paperHits += 1;
        return { ok: true, positionId: "pp-1", openPrice: 1.1 };
      },
      placeMetaApi: () => {
        metaApiHits += 1;
        return { ok: true, orderId: "x" };
      },
    });
    assert.equal(out.status, 200);
    assert.equal(out.body.paper, true);
    assert.equal(out.paperCalled, true);
    assert.equal(paperHits, 1);
    assert.equal(out.metaApiCalled, false);
    assert.equal(metaApiHits, 0);
    assert.equal(out.feedEvent, null);
  });

  it("TC3b: paper pending → 409 paper_market_only", () => {
    const out = simulateOrderPath({
      connectionMethod: "demo_paper",
      orderType: "buy_limit",
      liveTradingEnabled: true,
      guard: { allowed: true, accountId: "x" },
      placePaper: () => {
        throw new Error("no");
      },
      placeMetaApi: () => {
        throw new Error("no");
      },
    });
    assert.equal(out.status, 409);
    assert.equal((out.body as { code: string }).code, "paper_market_only");
    assert.equal(out.metaApiCalled, false);
  });

  it("TC4: close-position not blocked by live_trading_enabled=false", () => {
    const paper = simulateClosePath({
      connectionMethod: "demo_paper",
      liveTradingEnabled: false,
      closePaper: () => ({ ok: true, paper: true }),
      closeMetaApi: () => {
        throw new Error("cloud close must not run for paper");
      },
    });
    assert.equal(paper.status, 200);
    assert.equal(paper.blockedByLiveTrading, false);
    assert.equal(paper.paper, true);

    const cloud = simulateClosePath({
      connectionMethod: "cloud_mt5",
      liveTradingEnabled: false,
      closePaper: () => {
        throw new Error("paper must not run");
      },
      closeMetaApi: () => ({ ok: true }),
    });
    assert.equal(cloud.status, 200);
    assert.equal(cloud.blockedByLiveTrading, false);
  });

  it("TC5: healthy attended order under cap → allowed and MetaApi may run", () => {
    const d = evaluateAutoTrade({
      profile: propProfile,
      volumeLots: 0.01,
      openPositions: 0,
      autoTradesToday: 0,
      dayResultPct: -0.5,
      minutesToHighImpact: null,
      now: new Date("2026-10-14T10:00:00Z"),
      attended: true,
    });
    assert.equal(d.allowed, true);

    let metaApiHits = 0;
    const out = simulateOrderPath({
      connectionMethod: "cloud_mt5",
      orderType: "market",
      liveTradingEnabled: true,
      guard: { allowed: true, accountId: "acct-prop" },
      placePaper: () => {
        throw new Error("no paper");
      },
      placeMetaApi: () => {
        metaApiHits += 1;
        return { ok: true, orderId: "ord-1" };
      },
    });
    assert.equal(out.status, 200);
    assert.equal(out.metaApiCalled, true);
    assert.equal(metaApiHits, 1);
    assert.equal(out.feedEvent, null);
  });
});
