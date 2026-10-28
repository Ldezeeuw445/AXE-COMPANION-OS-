/**
 * The indicator panes: that a new one is wired all the way through, and that
 * a stored layout survives one being added.
 *
 * The maths for stochastic and ADX was finished and proven in
 * `verify-indicator-math.mjs` long before anything drew it. What stood between
 * the two was plumbing across five files, and `docs/AUTOPILOT.md` named the
 * trap: forget one list and the pane works until you reload, or syncs locally
 * and never to the server, which looks exactly like a sync that works.
 *
 * So these checks do not test that a line is drawn — no runner here renders
 * components. They test that the lists agree with each other, which is the
 * part that breaks silently.
 *
 * Run: node scripts/verify-indicator-panes.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PANE_MODES,
  isPaneMode,
  normalizePaneOrder,
  paneHeightKey,
} from "../src/lib/chart/panes.ts";
import { toSegmentedPath } from "../src/lib/chart/svgPath.ts";
import { SYNCED_SYMBOL_KEYS } from "../src/lib/chart/chartPrefs.ts";
import { SYMBOL_PREF_KEYS } from "../src/lib/accountPreferences.ts";
import { INDICATOR_FLAG_KEYS, resolveIndicatorNames } from "../src/lib/axeChartActions/indicatorMapping.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("every pane is wired all the way through");

check("each pane has a height key in both stored-key lists", () => {
  // The two lists are separate on purpose — one guards localStorage, one the
  // server column — and that is exactly why they drift.
  for (const mode of PANE_MODES) {
    const key = paneHeightKey(mode);
    assert.ok(
      SYNCED_SYMBOL_KEYS.includes(key),
      `${mode} has no synced height key: a drag would never reach another device`,
    );
    assert.ok(
      SYMBOL_PREF_KEYS.includes(key),
      `${mode}'s height key is refused by the server allowlist`,
    );
  }
});

check("each pane is something AXE can be asked to turn on", () => {
  for (const mode of PANE_MODES) {
    assert.ok(
      INDICATOR_FLAG_KEYS.includes(mode),
      `${mode} is not an indicator flag, so "AXE, show me ${mode}" cannot work`,
    );
  }
});

check("the names a trader would actually say map to the right pane", () => {
  const resolved = resolveIndicatorNames([
    "stochastic",
    "Stochastic Oscillator",
    "adx",
    "DMI",
    "trend strength",
  ]);
  assert.deepEqual(resolved.indicators, ["stoch", "adx"], "five spellings, two panes");
  assert.deepEqual(resolved.unknown, [], "none of these should fall through");
  assert.deepEqual(resolveIndicatorNames(["nonsense"]).unknown, ["nonsense"]);
});

check("each pane has a display name, so AXE does not say 'stoch'", () => {
  const prefs = read("src/lib/chart/chartPrefs.ts");
  const block = prefs.slice(prefs.indexOf("const INDICATOR_LABELS"));
  for (const mode of PANE_MODES) {
    assert.ok(
      new RegExp(`\\b${mode}:\\s*"`).test(block.slice(0, block.indexOf("};"))),
      `${mode} has no label, so the morning brief would name it in code`,
    );
  }
});

check("each pane declares its own axis scale", () => {
  // A mode with no entry falls through to the volume branch and gets labelled
  // with a maximum it never computed.
  const pane = read("src/components/chart/indicators/IndicatorPane.tsx");
  const scales = pane.slice(pane.indexOf("BOUNDED_SCALES"), pane.indexOf("const EMPTY_GEOMETRY"));
  for (const mode of ["rsi", "stoch", "adx"]) {
    assert.ok(new RegExp(`\\b${mode}:\\s*\\{`).test(scales), `${mode} has no axis scale`);
  }
  assert.ok(/stoch:.*80.*20/s.test(scales), "stochastic is read against 80 and 20");
  assert.ok(/adx:.*emphasis:\s*25/s.test(scales), "ADX is read against 25, not 50");
});

check("the pro gate names the set, it does not spell out one pane", () => {
  // It read `m !== "macd"` in three places, so stoch and adx would have been
  // free while macd stayed paid — on the same shelf.
  const screen = read("src/components/chart/ChartScreen.tsx");
  assert.ok(
    !/canFullIndicators \|\| m !== "macd"/.test(screen),
    "a hard-coded pane name in the gate leaves every later pane ungated",
  );
  assert.ok(
    screen.includes("canFullIndicators || !PRO_ONLY_INDICATORS.has(m)"),
    "the gate must ask the set",
  );
});

console.log("\na stored layout survives a new pane");

check("an order saved before a pane existed keeps its arrangement", () => {
  // The real upgrade case, and what `parsed.length === 3` threw away.
  const order = normalizePaneOrder(["rsi", "volume", "macd"]);
  assert.ok(
    order,
    "an order from an older build was thrown away — this is the `parsed.length === 3` bug",
  );
  assert.deepEqual(order.slice(0, 3), ["rsi", "volume", "macd"], "their choice is kept");
  assert.deepEqual([...order].sort(), [...PANE_MODES].sort(), "and the new panes are there");
  assert.equal(order.length, PANE_MODES.length);
});

check("new panes land at the end, not in the middle of their layout", () => {
  const order = normalizePaneOrder(["macd"]);
  assert.ok(order, "a one-entry order is still an order");
  assert.equal(order[0], "macd", "the pane they put first stays first");
  assert.deepEqual([...order].sort(), [...PANE_MODES].sort());
});

check("a pane that no longer exists is dropped rather than rendered", () => {
  const order = normalizePaneOrder(["volume", "cci", "rsi"]);
  assert.ok(order, "unknown entries are dropped, not the whole order");
  assert.ok(!order.includes("cci"));
  assert.equal(order.length, PANE_MODES.length);
});

check("a repeated entry cannot claim the same React key twice", () => {
  const order = normalizePaneOrder(["rsi", "rsi", "volume"]);
  assert.ok(order, "a duplicate is cleaned up, it does not void the order");
  assert.equal(new Set(order).size, order.length);
  assert.equal(order[0], "rsi");
});

check("nothing worth restoring gives null, so the caller keeps its default", () => {
  assert.equal(normalizePaneOrder(null), null);
  assert.equal(normalizePaneOrder("volume,rsi"), null, "a string is not an order");
  assert.equal(normalizePaneOrder([]), null);
  assert.equal(normalizePaneOrder(["cci", "atr"]), null, "all unknown is nothing to restore");
  assert.equal(isPaneMode("cci"), false);
});

console.log("\nwhere the maths has no answer, the line stops");

check("a gap breaks the path instead of drawing through it", () => {
  // A flat window has no %K. Joining across it draws a straight segment over
  // bars where nothing was computed, and on an oscillator that reads as trend.
  const path = toSegmentedPath([
    { x: 0, y: 10 },
    { x: 1, y: 20 },
    null,
    { x: 3, y: 30 },
    { x: 4, y: 40 },
  ]);
  assert.equal(path, "M0.0 10.0 L1.0 20.0 M3.0 30.0 L4.0 40.0");
  assert.equal((path.match(/M/g) ?? []).length, 2, "the gap starts a new subpath");
});

check("leading nulls do not start a line before the first value", () => {
  const path = toSegmentedPath([null, null, { x: 2, y: 5 }, { x: 3, y: 6 }]);
  assert.ok(path.startsWith("M2.0 5.0"), `ADX's warm-up must draw nothing: "${path}"`);
  assert.equal((path.match(/M/g) ?? []).length, 1);
});

check("a series with no values at all draws nothing", () => {
  assert.equal(toSegmentedPath([null, null]), "");
  assert.equal(toSegmentedPath([]), "");
});

check("a non-finite coordinate is a gap, not a NaN in the markup", () => {
  // Division by a zero range reaches the path as NaN; "MNaN NaN" makes the
  // browser drop the whole path, so one bad bar would erase the indicator.
  const path = toSegmentedPath([{ x: 0, y: 1 }, { x: Number.NaN, y: 2 }, { x: 2, y: 3 }]);
  assert.ok(!/NaN/.test(path), `NaN must never reach the DOM: "${path}"`);
  assert.equal(path, "M0.0 1.0 M2.0 3.0");
});

console.log(`\n${passed} checks passed`);
