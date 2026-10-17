/**
 * Verification for src/lib/feed/chartActionSummary.ts and its wiring.
 *
 * Two bugs this locks down. The feed rendered the raw action name
 * ("Draw_fibonacci") with no what and no why. And it filtered on
 * status: "pending", so the record of what AXE drew erased itself the moment
 * the chart applied it — the one item worth looking back at was the one that
 * disappeared.
 *
 * Run: node scripts/verify-chart-action-feed.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chartActionSummary } from "../src/lib/feed/chartActionSummary.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("chartActionSummary");

check("a fib carries the reason AXE gave", () => {
  const s = chartActionSummary({
    actionType: "draw_fibonacci",
    symbol: "xauusd",
    timeframe: "h1",
    payload: { reason: "the last impulse low to the high is the swing everything is reacting to" },
    status: "applied",
  });
  assert.equal(s.title, "Fibonacci on XAUUSD H1");
  assert.match(s.body, /impulse low to the high/);
  assert.match(s.body, /Applied to your chart/);
});

check("an item without a reason still says what and where", () => {
  const s = chartActionSummary({
    actionType: "draw_trendline",
    symbol: "eurusd",
    timeframe: "m15",
    payload: {},
    status: "pending",
  });
  assert.equal(s.title, "Trendline on EURUSD M15");
  assert.match(s.body, /Opens with your chart/);
  assert.ok(!s.body.includes("undefined"));
});

check("indicators are named, and on/off is not guessed", () => {
  const on = chartActionSummary({
    actionType: "add_indicator",
    symbol: "btcusd",
    timeframe: "h4",
    payload: { indicators: ["fvg", "rsi"], enable: true },
  });
  assert.match(on.body, /Turned on fvg, rsi/);

  const off = chartActionSummary({
    actionType: "add_indicator",
    symbol: "btcusd",
    timeframe: "h4",
    payload: { indicators: ["fvg"], enable: false },
  });
  assert.match(off.body, /Turned off fvg/);
});

check("the raw action name never reaches the trader", () => {
  const s = chartActionSummary({ actionType: "clear_ai_drawings", symbol: "xauusd", timeframe: "h1" });
  assert.ok(!/draw_|_ai_|_/.test(s.title), `still raw: ${s.title}`);
  assert.match(s.title, /Cleared AXE drawings/);
});

check("a malformed payload cannot break the item", () => {
  const s = chartActionSummary({
    actionType: "add_indicator",
    symbol: "xauusd",
    timeframe: "h1",
    payload: { indicators: "not-an-array", reason: 42 },
  });
  assert.ok(s.title.length > 0 && s.body.length > 0);
  assert.ok(!s.body.includes("42"), "a non-string reason must be ignored, not printed");
});

console.log("wiring");
const feed = readFileSync("src/services/axeFeedService.ts", "utf8");
const handlers = readFileSync("src/services/axeToolHandlers.ts", "utf8");
const service = readFileSync("src/services/axeService.ts", "utf8");

check("applied chart actions stay in the feed", () => {
  const block = feed.slice(
    feed.indexOf('from("axe_pending_chart_actions")'),
    feed.indexOf('from("axe_daily_briefings")'),
  );
  assert.ok(
    !/\.eq\("status", "pending"\)/.test(block),
    "filtering on pending erases the record the moment the chart opens",
  );
  assert.ok(/payload,status/.test(block), "the summary needs payload and status");
});

check("the feed uses the summary, not the raw action name", () => {
  assert.ok(/chartActionSummary\(/.test(feed));
  assert.ok(
    !/action\.charAt\(0\)\.toUpperCase\(\)/.test(feed),
    "the raw-name renderer is back",
  );
});

check("the reason survives from the tool call to the stored action", () => {
  assert.ok(/payload\.reason = args\.reason/.test(handlers), "the tool drops the reason");
  assert.ok(/reason: \{/.test(service), "route_chart_action has no reason parameter");
  assert.ok(
    /Always pass `reason` to route_chart_action/.test(service),
    "the model is never told to explain itself",
  );
});

check("the reason reads as a sentence, wherever it lands", () => {
  // "At 1.0842. prior day high" reads like a typo rather than a thought.
  const after = chartActionSummary({
    actionType: "mark_key_level",
    symbol: "EURUSD",
    timeframe: "M15",
    payload: { level: "1.0842", reason: "prior day high, untested" },
    status: "applied",
  });
  assert.match(after.body, /At 1\.0842\. Prior day high, untested\./);

  // First in the line it keeps the author's own casing — AXE may have started
  // with a symbol or a number, and forcing a capital there would mangle it.
  const first = chartActionSummary({
    actionType: "draw_fibonacci",
    symbol: "XAUUSD",
    timeframe: "H1",
    payload: { reason: "retracement into the 61.8" },
    status: "applied",
  });
  assert.ok(first.body.startsWith("retracement into the 61.8."), first.body);
});

console.log(`\n${passed} checks passed`);
