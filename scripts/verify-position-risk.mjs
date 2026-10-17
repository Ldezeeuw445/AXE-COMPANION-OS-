/**
 * Verification for src/lib/risk/positionRisk.ts
 *
 * The case worth catching: three tickets that look like three ideas and are
 * one. And, just as important, three tickets that genuinely are three ideas
 * producing silence.
 *
 * Run: node scripts/verify-position-risk.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detectConcentration,
  topConcentration,
  weekendExposureWarning,
} from "../src/lib/risk/positionRisk.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const p = (symbol, side, volume = 1) => ({ symbol, side, volume });

console.log("positionRisk");

check("genuinely different trades produce no warning", () => {
  const found = detectConcentration([
    p("EURUSD", "buy"),
    p("XAUUSD", "sell"),
    p("JP225", "buy"),
  ]);
  assert.deepEqual(found, [], `expected silence, got: ${found.map((f) => f.id).join(", ")}`);
});

check("a single position can never be concentrated", () => {
  assert.deepEqual(detectConcentration([p("XAUUSD", "buy", 5)]), []);
});

check("the same pair twice the same way is one idea, and says the total lots", () => {
  const f = topConcentration([p("XAUUSD", "buy", 0.8), p("XAUUSD", "buy", 1.6)]);
  assert.ok(f);
  assert.equal(f.id, "same_symbol");
  assert.match(f.title, /2 positions on XAUUSD, all long/);
  assert.match(f.body, /2\.4 lots/);
});

check("hedged positions on one pair are not flagged as a stack", () => {
  const ids = detectConcentration([p("EURUSD", "buy"), p("EURUSD", "sell")]).map((f) => f.id);
  assert.ok(!ids.includes("same_symbol"), "opposite sides are not the same bet");
});

check("one currency across three pairs is named as one view", () => {
  // Long EURUSD, long GBPUSD, short USDJPY → all short USD.
  const f = detectConcentration([
    p("EURUSD", "buy"),
    p("GBPUSD", "buy"),
    p("USDJPY", "sell"),
  ]).find((x) => x.id === "currency_stack" && x.title.includes("USD"));
  assert.ok(f, "did not spot the dollar bet");
  assert.match(f.title, /short USD in 3 pairs/);
  assert.match(f.body, /one view on USD/);
});

check("two metals the same way move as a block", () => {
  const f = detectConcentration([p("XAUUSD", "buy", 1), p("XAGUSD", "buy", 0.5)]).find(
    (x) => x.id === "metal_stack",
  );
  assert.ok(f);
  assert.match(f.body, /1\.5 lots/);
});

check("two indices the same way move as a block", () => {
  const f = detectConcentration([p("NAS100", "sell"), p("US30", "sell")]).find(
    (x) => x.id === "index_stack",
  );
  assert.ok(f);
  assert.match(f.title, /Short 2 indices at once/);
});

check("MT5 numeric sides are read correctly", () => {
  // 0 = buy, 1 = sell. Reading these as strings would invert every finding.
  const f = topConcentration([p("XAUUSD", 0, 1), p("XAUUSD", 0, 1)]);
  assert.ok(f);
  assert.match(f.title, /all long/);
  const g = topConcentration([p("XAUUSD", 1, 1), p("XAUUSD", 1, 1)]);
  assert.match(g.title, /all short/);
});

check("broker suffixes do not hide a stack", () => {
  const f = topConcentration([p("XAUUSD.r", "buy", 1), p("XAUUSD", "buy", 1)]);
  assert.ok(f, "XAUUSD.r and XAUUSD are the same instrument");
  assert.equal(f.symbols[0], "XAUUSD");
});

console.log("weekend exposure");

const fridayEvening = new Date("2026-10-09T19:00:00Z"); // a Friday
const wednesday = new Date("2026-10-07T19:00:00Z");

check("a prop account that may not hold is told before the close", () => {
  const w = weekendExposureWarning(fridayEvening, 2, false);
  assert.ok(w);
  assert.match(w.title, /Weekend rule/);
  assert.match(w.body, /2 positions/);
});

check("an account that may hold gets the gap warning, not a rule warning", () => {
  const w = weekendExposureWarning(fridayEvening, 1, true);
  assert.ok(w);
  assert.match(w.title, /gap risk/);
});

check("flat on a Friday evening is silence", () => {
  assert.equal(weekendExposureWarning(fridayEvening, 0, false), null);
});

check("Wednesday evening is not the weekend", () => {
  assert.equal(weekendExposureWarning(wednesday, 3, false), null);
});

console.log("watcher wiring");
const watcher = readFileSync("src/services/axeProactiveWatcher.ts", "utf8");

check("the watcher runs all three new rules", () => {
  assert.ok(/detectConcentration\(/.test(watcher));
  assert.ok(/weekendExposureWarning\(/.test(watcher));
  assert.ok(/detectWeakSpots\(/.test(watcher));
});

check("the weak-spot nudge is keyed per week, not per run", () => {
  assert.ok(
    /weakspot:\$\{top\.id\}:\$\{weekStamp\}/.test(watcher),
    "a pattern repeated every 15 minutes is noise, not insight",
  );
});

console.log(`\n${passed} checks passed`);
