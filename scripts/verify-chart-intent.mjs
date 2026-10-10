/**
 * Guards for chart-action routing.
 *
 * The bug this locks down: the composer consulted the local phrase matcher
 * FIRST and returned, so a message matching one of sixteen literal phrases
 * never reached AXE. The drawing appeared and AXE had no idea it had been
 * asked — no reply, nothing in the conversation, nothing to learn from.
 *
 * Run: node scripts/verify-chart-intent.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectFallbackChartActionIntent } from "../src/lib/axeChartActions/chartIntent.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("intent detection");

check("the phrasings the old literal list missed now match", () => {
  // Every one of these failed against the sixteen hardcoded strings.
  for (const text of [
    "kun je even een fib zetten",
    "doe eens een fibonacci op de chart",
    "plot a fib for me",
    "show me the fibonacci",
    "zet er een fib bij",
  ]) {
    assert.equal(detectFallbackChartActionIntent(text), "draw_fibonacci", `missed: ${text}`);
  }
});

check("the phrasings it already handled still match", () => {
  for (const text of ["draw fib", "zet fib", "fibonacci on latest swing"]) {
    assert.equal(detectFallbackChartActionIntent(text), "draw_fibonacci", `regressed: ${text}`);
  }
});

check("clearing is not read as drawing", () => {
  assert.equal(detectFallbackChartActionIntent("clear the drawings"), "clear_ai_drawings");
  assert.equal(detectFallbackChartActionIntent("haal die tekeningen weg"), "clear_ai_drawings");
});

check("trendlines, key levels and indicators are told apart", () => {
  assert.equal(detectFallbackChartActionIntent("teken een trendlijn"), "draw_trendline");
  assert.equal(detectFallbackChartActionIntent("mark the PDH"), "mark_key_level");
  assert.equal(detectFallbackChartActionIntent("zet rsi aan"), "add_indicator");
});

check("ordinary conversation is not a chart command", () => {
  for (const text of [
    "what do you think of gold today",
    "hoe staat mijn account ervoor",
    "did I follow my rules this week",
    "", // empty
  ]) {
    assert.equal(detectFallbackChartActionIntent(text), null, `false positive on: ${text}`);
  }
});

check("talking about a fib is not asking for one", () => {
  assert.equal(
    detectFallbackChartActionIntent("what is a fibonacci retracement"),
    null,
    "a question about fibs must not draw one",
  );
});

console.log("composer wiring");
const composer = readFileSync("src/components/chat/Composer.tsx", "utf8");

check("the composer no longer short-circuits before AXE sees the message", () => {
  assert.ok(
    !/const chartAction = detectFallbackChartActionIntent\(text\);\s*\n\s*if \(chartAction && !image\) \{[\s\S]{0,300}?return;/.test(
      composer,
    ),
    "the short-circuit is back — AXE would never see the message",
  );
});

check("the intent is remembered and used only after a failed turn", () => {
  assert.ok(/const chartIntent = image \? null : detectFallbackChartActionIntent\(text\);/.test(composer));
  assert.ok(/if \(chartIntent && !turnProduced\)/.test(composer), "the net must depend on the turn failing");
  const detect = composer.indexOf("const chartIntent =");
  const route = composer.indexOf("if (chartIntent && !turnProduced)");
  const send = composer.indexOf('fetch("/api/chat/stream"');
  assert.ok(detect < send, "intent is computed before sending");
  assert.ok(send < route, "but routed only after the request has been attempted");
});

check("a successful turn marks itself, so the net stays out of the way", () => {
  assert.ok(/turnProduced = true;/.test(composer));
});

console.log(`\n${passed} checks passed`);
