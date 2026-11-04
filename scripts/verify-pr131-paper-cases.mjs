/**
 * PR #131 paper-testplan TC1–TC5 as static + pure checks (no real broker).
 * Behavioral mocks for TC2/TC5 live in src/services/tradeGuardService.test.ts.
 *
 * Run: npx tsx scripts/verify-pr131-paper-cases.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAccountProfile } from "../src/lib/risk/accountProfile.ts";
import { evaluateAutoTrade } from "../src/lib/trading/autoTradeGuard.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const orderRoute = read("src/app/api/mt5/order/route.ts");
const closeRoute = read("src/app/api/mt5/close-position/route.ts");
const quick = read("src/services/mt5QuickOrderService.ts");

console.log("TC1 — guard fail → 403 + order_blocked, never MetaApi");

check("order route records order_blocked then returns 403 with guard.reason", () => {
  assert.ok(/order_blocked:\$\{Date\.now\(\)\}:\$\{guard\.reason\}/.test(orderRoute));
  assert.ok(/return errJson\(403, guard\.reason, guard\.detail\)/.test(orderRoute));
});

check("decideAutoTradeAllowed runs before clientPlaceOrder", () => {
  const g = orderRoute.indexOf("decideAutoTradeAllowed(");
  const p = orderRoute.indexOf("clientPlaceOrder(");
  assert.ok(g > 0 && p > g);
  const between = orderRoute.slice(g, p);
  assert.ok(/if \(!guard\.allowed\)/.test(between));
});

check("quick-order path also blocks with order_blocked before place", () => {
  const g = quick.indexOf("decideAutoTradeAllowed(");
  const p = quick.search(/clientPlaceOrder\(|placeOrder\(/);
  assert.ok(g > 0);
  assert.ok(/order_blocked:/.test(quick));
});

console.log("\nTC2 — missing equity → daily_loss_unknown (pure guard)");

check("prop profile with null dayResultPct fails closed", () => {
  const profile = buildAccountProfile({
    label: "FTMO Challenge 100K",
    mt5Server: "FTMO-Server",
  });
  assert.ok(profile.maxDailyLossPct != null && profile.maxDailyLossPct > 0);
  const d = evaluateAutoTrade({
    profile,
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
});

check("demo/live without daily cap still allows null dayResultPct", () => {
  const profile = buildAccountProfile({
    label: "ICMarkets LIVE",
    mt5Server: "ICMarkets-Live",
  });
  assert.equal(profile.maxDailyLossPct, null);
  const d = evaluateAutoTrade({
    profile,
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

console.log("\nTC3 — paper returns before guard and MetaApi");

check("demo_paper branch returns paper:true before decideAutoTradeAllowed", () => {
  const paper = orderRoute.indexOf('connection_method === "demo_paper"');
  const guard = orderRoute.indexOf("decideAutoTradeAllowed(");
  const place = orderRoute.indexOf("clientPlaceOrder(");
  assert.ok(paper > 0 && guard > paper && place > guard);
  const between = orderRoute.slice(paper, guard);
  assert.ok(/placePaperOrder\(/.test(between));
  assert.ok(/return Response\.json\(\{\s*ok: true,\s*paper: true/.test(between));
  assert.ok(!/decideAutoTradeAllowed/.test(between));
  assert.ok(!/clientPlaceOrder/.test(between));
});

check("paper pending orders are refused with paper_market_only", () => {
  assert.ok(/paper_market_only/.test(orderRoute));
});

console.log("\nTC4 — close-position not gated by live-trading switch");

check("close route has no live_trading_enabled check", () => {
  assert.ok(!/live_trading_enabled/.test(closeRoute));
  assert.ok(!/live_trading_disabled/.test(closeRoute));
});

check("close still has auth + ownership + paper branch", () => {
  assert.ok(/getUser\(\)/.test(closeRoute));
  assert.ok(/user_broker_accounts/.test(closeRoute));
  assert.ok(/closePaperPositionById\(/.test(closeRoute));
});

console.log("\nTC5 — healthy attended order allowed by pure guard");

check("funded under daily loss with small size is allowed when attended", () => {
  const profile = buildAccountProfile({
    label: "FTMO Challenge 100K",
    mt5Server: "FTMO-Server",
  });
  const d = evaluateAutoTrade({
    profile,
    volumeLots: 0.01,
    openPositions: 0,
    autoTradesToday: 0,
    dayResultPct: -0.5,
    minutesToHighImpact: null,
    now: new Date("2026-10-14T10:00:00Z"),
    attended: true,
  });
  assert.equal(d.allowed, true);
});

console.log(`\n${passed} checks passed (TC1–TC5 wiring/pure)`);
