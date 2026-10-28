/**
 * The practice account can actually be traded on now — and still cannot send
 * anything to a broker.
 *
 * `/api/mt5/order` answered a demo account with a flat 409. True (nothing
 * reaches a broker) and useless: a practice account you cannot place an order
 * on is a chart with extra steps. Build-list item 10.
 *
 * The thing to be careful about when opening that door is that it stays a
 * door to paper. These checks read the route and the service to hold three
 * lines: a practice account never reaches MetaApi, a real account never
 * reaches the paper path, and every paper fill records whether its price was
 * real.
 *
 * Run: node scripts/verify-paper-order-route.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const route = read("src/app/api/mt5/order/route.ts");
const service = read("src/services/paperOrderService.ts");

console.log("a practice order is filled, not refused");

check("the flat demo refusal is gone", () => {
  assert.ok(
    !/AXE Demo Account is virtual/.test(route),
    "the 409 that made the practice account useless must be gone",
  );
  assert.ok(route.includes("placePaperOrder("), "and the paper path must be wired in");
});

check("the practice branch returns before any broker call", () => {
  // The line that matters: if the paper branch ever falls through, a practice
  // order reaches MetaApi.
  const branch = route.indexOf('connection_method === "demo_paper"');
  const placeOrder = route.indexOf("clientPlaceOrder(");
  assert.ok(branch > 0 && placeOrder > branch, "the paper branch must come first");
  const between = route.slice(branch, placeOrder);
  assert.ok(
    /return Response\.json\(\{\s*ok: true,\s*paper: true/.test(between),
    "the paper branch has to return, not fall through to the broker",
  );
});

check("a practice order does not need the broker provider configured", () => {
  // Paper has no broker. Requiring a MetaApi token to place a pretend trade
  // would make practice impossible exactly where it is most useful.
  const tokenCheck = route.indexOf("getMetaApiToken()");
  const branch = route.indexOf('connection_method === "demo_paper"');
  assert.ok(tokenCheck > branch, "the provider check must sit after the paper branch");
  assert.ok(
    /Everything below sends a real order/.test(route),
    "and say why it moved, or someone will move it back",
  );
});

check("pending order types are refused rather than pretended", () => {
  // A limit order that nothing is watching would sit there forever while the
  // UI shows it as placed. Saying no is the honest answer until a watcher
  // exists.
  assert.ok(/paper_market_only/.test(route), "a pending order on paper must be refused");
  const idx = route.indexOf("paper_market_only");
  const near = route.slice(idx - 400, idx + 400);
  assert.ok(/orderType !== "market"/.test(near), "and refused on the order type, not on something else");
});

console.log("\nthe real path is untouched");

check("a live account never reaches the paper service", () => {
  const branch = route.indexOf('connection_method === "demo_paper"');
  const liveGate = route.indexOf('connection_method !== "cloud_mt5"');
  assert.ok(liveGate > branch, "the cloud_mt5 requirement still guards the real path");
  assert.ok(
    /live_trading_not_enabled|live.?trading/i.test(route),
    "the live-trading acknowledgement must still be there for real orders",
  );
});

check("the live-trading gate is skipped for paper on purpose, and said so", () => {
  // Making someone accept a real-money risk disclaimer to place a pretend
  // trade teaches them to click through disclaimers.
  assert.ok(
    /there is no broker here/.test(service),
    "the reason for skipping it belongs in the file, not in a commit message",
  );
});

console.log("\nevery fill remembers whether its price was real");

check("the row records the origin of the price", () => {
  assert.ok(/quote_origin: resolved\.origin/.test(service), "the origin must reach the row");
  assert.ok(
    /simulatedQuote\(getDemoQuotePrice\(/.test(service),
    "no live feed falls back to the generator, explicitly",
  );
});

check("a live quote is preferred over the generator", () => {
  const live = service.indexOf("findLiveQuote(");
  const sim = service.indexOf("simulatedQuote(getDemoQuotePrice(");
  assert.ok(live > 0 && sim > live, "look for a real price first");
});

check("the quote lookup is scoped to the trader, not left to RLS alone", () => {
  // A query that is only safe because of a policy is one policy edit away
  // from leaking.
  const idx = service.indexOf("chart_live_snapshots");
  const near = service.slice(idx, idx + 400);
  assert.ok(/\.eq\("user_id", userId\)/.test(near), "scope the read by user_id");
});

check("a missing table is named, not reported as a generic failure", () => {
  // The migration applies separately, so this is a real state. Without this
  // the next person debugs the order path when the answer is one SQL file.
  assert.ok(/paper_table_missing/.test(service));
  assert.ok(/does not exist/i.test(service), "detect the specific Postgres error");
  assert.ok(
    /503/.test(route) && /paper_table_missing/.test(route),
    "and answer 503 — this is the server not being set up, not a bad request",
  );
});

console.log(`\n${passed} checks passed`);
