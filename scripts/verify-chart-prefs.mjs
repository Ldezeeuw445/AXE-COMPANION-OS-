/**
 * Your chart setup, held somewhere other than one browser.
 *
 * Three costs of localStorage-only, and the third is the one that mattered:
 * a new phone started from nothing; Companion and Trading OS run on one
 * Supabase project and shared nothing about how a trader reads a chart; and
 * AXE could not see any of it, which is why `learningArcService` used to put
 * "Key indicators they use: RSI, MACD, MA" into the morning-brief prompt —
 * three names that were a constant in the source, handed to the model under
 * "Key facts" for every trader alike.
 *
 * What has to hold: the local write still happens first and synchronously, a
 * failed sync changes nothing, the endpoint cannot be used as an open
 * key/value store, and what AXE is told is what the trader actually switched
 * on — or nothing.
 *
 * Run: node scripts/verify-chart-prefs.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ANY_SCOPE,
  MAX_PREF_VALUE_LENGTH,
  SYNCED_ACCOUNT_KEYS,
  SYNCED_KEYS,
  SYNCED_SYMBOL_KEYS,
  accountScope,
  isSyncedKey,
  mergeScopes,
  pickNewerScope,
  sanitisePrefs,
  scopeId,
  summariseChartSetup,
  symbolScope,
} from "../src/lib/chart/chartPrefs.ts";
import { PREF_KEYS } from "../src/lib/accountPreferences.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(p, "utf8");
/** The comments quote the code they replaced, so match on code only. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");

const row = (accountKey, symbolKey, prefs, updatedAt) => ({
  accountKey,
  symbolKey,
  prefs,
  updatedAt,
});

console.log("what may be stored");

check("the synced list and the localStorage list stay in step", () => {
  // Two lists that drift silently is how a preference starts saving locally
  // and never syncing, which looks exactly like a sync that is working.
  assert.deepEqual([...SYNCED_KEYS].sort(), [...PREF_KEYS].sort());
  assert.equal(SYNCED_ACCOUNT_KEYS.length + SYNCED_SYMBOL_KEYS.length, SYNCED_KEYS.length);
});

check("an unknown key is refused, not stored", () => {
  // The column is jsonb and the body is whatever was sent. Without an
  // allowlist this is an open key/value store under the trader's own row.
  assert.ok(isSyncedKey("axe.chart.indicatorFlags"));
  assert.ok(!isSyncedKey("axe.chart.anything"));
  assert.ok(!isSyncedKey("__proto__"));
  const out = sanitisePrefs(
    { "axe.chart.maPeriod": "20", "evil.key": "x", __proto__: "y" },
    { accountKey: "acc", symbolKey: "XAUUSD" },
  );
  assert.deepEqual(Object.keys(out), ["axe.chart.maPeriod"]);
});

check("a value too long to be real is dropped", () => {
  const ok = sanitisePrefs(
    { "axe.chart.maPeriod": "x".repeat(MAX_PREF_VALUE_LENGTH) },
    { accountKey: "acc", symbolKey: "XAUUSD" },
  );
  assert.equal(Object.keys(ok).length, 1, "exactly at the cap is still fine");

  const tooBig = sanitisePrefs(
    { "axe.chart.maPeriod": "x".repeat(MAX_PREF_VALUE_LENGTH + 1) },
    { accountKey: "acc", symbolKey: "XAUUSD" },
  );
  assert.deepEqual(tooBig, {}, "one crafted request must not become a megabyte row");
});

check("a key sent against the wrong scope goes nowhere, loudly", () => {
  // Storing it anyway would put it somewhere it is never read from, and a
  // preference that silently goes nowhere is worse than one that is refused.
  const wrongScope = sanitisePrefs(
    { "axe.chart.indicatorFlags": "{}" },
    { accountKey: "acc", symbolKey: ANY_SCOPE },
  );
  assert.deepEqual(wrongScope, {}, "a per-symbol key has no meaning in the account scope");

  const rightScope = sanitisePrefs(
    { "axe.chart.indicatorFlags": "{}", "axe-chart-theme": "dark" },
    { accountKey: "acc", symbolKey: "XAUUSD" },
  );
  assert.deepEqual(Object.keys(rightScope).sort(), ["axe.chart.indicatorFlags"]);
});

check("only strings are stored", () => {
  const out = sanitisePrefs(
    { "axe.chart.maPeriod": 20, "axe.chart.maType": "ema" },
    { accountKey: "acc", symbolKey: "XAUUSD" },
  );
  assert.deepEqual(out, { "axe.chart.maType": "ema" }, "a number is not what the app reads back");
  assert.deepEqual(sanitisePrefs(null, { accountKey: "a", symbolKey: "b" }), {});
  assert.deepEqual(sanitisePrefs([1, 2], { accountKey: "a", symbolKey: "b" }), {});
});

console.log("\nscopes");

check("no account and no symbol are a literal scope, not a null", () => {
  // Postgres will not enforce a primary key across nullable columns, and
  // "is null" special cases spread through every query that touches it.
  assert.equal(accountScope(null), ANY_SCOPE);
  assert.equal(accountScope(""), ANY_SCOPE);
  assert.equal(accountScope("   "), ANY_SCOPE);
  assert.equal(symbolScope(undefined), ANY_SCOPE);
  assert.equal(accountScope("abc-123"), "abc-123");
});

check("a symbol is one symbol however it was typed", () => {
  assert.equal(symbolScope(" xauusd "), "XAUUSD");
  assert.equal(symbolScope("XauUsd"), "XAUUSD");
});

check("scope keys are bounded, because they land in a constrained column", () => {
  assert.ok(accountScope("a".repeat(500)).length <= 64);
  assert.ok(symbolScope("a".repeat(500)).length <= 32);
});

check("a scope id is unambiguous", () => {
  assert.equal(scopeId(row("acc", "XAUUSD", {}, "")), "acc::XAUUSD");
  assert.notEqual(
    scopeId(row("a", "bc", {}, "")),
    scopeId(row("ab", "c", {}, "")),
    "a separator that can be forged would merge two traders' scopes",
  );
});

console.log("\nwhich device wins");

check("a scope this device has never seen is adopted outright", () => {
  // The new-phone case, and the whole point of the feature.
  const remote = row("acc", "XAUUSD", { "axe.chart.maType": "ema" }, "2026-10-21T05:00:00Z");
  assert.equal(pickNewerScope(null, remote), remote);
});

check("newest wins, and a tie keeps this device", () => {
  const mine = row("acc", "XAUUSD", { "axe.chart.maType": "sma" }, "2026-10-21T05:00:00Z");
  const theirs = row("acc", "XAUUSD", { "axe.chart.maType": "ema" }, "2026-10-21T06:00:00Z");
  assert.equal(pickNewerScope(mine, theirs), theirs);
  assert.equal(pickNewerScope(theirs, mine), theirs);
  // A tie keeps local: the device in front of the trader is the one they are
  // looking at, and swapping it under them would be worse than a stale copy.
  const sameTime = row("acc", "XAUUSD", { "axe.chart.maType": "ema" }, mine.updatedAt);
  assert.equal(pickNewerScope(mine, sameTime), mine);
});

check("an unreadable timestamp never beats a readable one", () => {
  const good = row("acc", "XAUUSD", {}, "2026-10-21T05:00:00Z");
  const broken = row("acc", "XAUUSD", {}, "whenever");
  assert.equal(pickNewerScope(good, broken), good);
  assert.equal(pickNewerScope(broken, good), good);
});

check("a scope is merged whole, never half of each device", () => {
  // The keys in one scope are read together and written together. Mixing
  // halves would produce a chart neither device ever had.
  const mine = row(
    "acc",
    "XAUUSD",
    { "axe.chart.maType": "sma", "axe.chart.maPeriod": "20" },
    "2026-10-21T05:00:00Z",
  );
  const theirs = row("acc", "XAUUSD", { "axe.chart.maType": "ema" }, "2026-10-21T06:00:00Z");
  const merged = mergeScopes([mine], [theirs]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].prefs, { "axe.chart.maType": "ema" });
  assert.ok(!("axe.chart.maPeriod" in merged[0].prefs), "no leftovers from the older copy");
});

check("merging keeps every scope, not just the overlapping ones", () => {
  const merged = mergeScopes(
    [row("acc", "XAUUSD", { "axe.chart.maType": "sma" }, "2026-10-21T05:00:00Z")],
    [row("acc", "EURUSD", { "axe.chart.maType": "ema" }, "2026-10-21T05:00:00Z")],
  );
  assert.equal(merged.length, 2);
});

console.log("\nwhat AXE is told");

const flags = (obj) => JSON.stringify(obj);

check("the indicators AXE names are the ones actually switched on", () => {
  const setup = summariseChartSetup([
    row("acc", "XAUUSD", { "axe.chart.indicatorFlags": flags({ rsi: true, vwap: true, macd: false }) }, "x"),
    row("acc", "EURUSD", { "axe.chart.indicatorFlags": flags({ rsi: true }) }, "x"),
  ]);
  // RSI is on two charts, VWAP on one, so RSI leads: what they reach for on
  // everything, ahead of what they tried once.
  assert.deepEqual(setup.indicators, ["RSI", "VWAP"]);
  assert.ok(!setup.indicators.includes("MACD"), "false is off, not merely unset");
  assert.equal(setup.scopes, 2);
  assert.deepEqual(setup.symbols, ["EURUSD", "XAUUSD"]);
});

check("SMC overlays are reported too, under their own names", () => {
  const setup = summariseChartSetup([
    row("acc", "XAUUSD", { "axe.chart.smcFlags": flags({ orderBlocks: true, pdh: true }) }, "x"),
  ]);
  assert.deepEqual(setup.smcTools, ["Order blocks", "Previous day high"]);
});

check("a trader who has changed nothing gets an empty answer, not three names", () => {
  // This is the whole reason the feature exists. "RSI, MACD, MA" was a
  // constant in learningArcService, handed to the model as fact.
  assert.deepEqual(summariseChartSetup([]), {
    indicators: [],
    smcTools: [],
    scopes: 0,
    symbols: [],
  });
  const noFlags = summariseChartSetup([row("acc", "XAUUSD", { "axe.chart.maType": "ema" }, "x")]);
  assert.deepEqual(noFlags.indicators, []);
  assert.equal(noFlags.scopes, 1, "they have a saved chart, just no indicators on it");
});

check("broken stored JSON is ignored instead of throwing", () => {
  const setup = summariseChartSetup([
    row("acc", "XAUUSD", { "axe.chart.indicatorFlags": "{not json" }, "x"),
    row("acc", "EURUSD", { "axe.chart.indicatorFlags": flags({ rsi: true }) }, "x"),
  ]);
  assert.deepEqual(setup.indicators, ["RSI"], "one bad row must not blank the rest");
});

check("the account scope is not counted as a chart", () => {
  // Theme and grid live there and say nothing about how a chart is read.
  const setup = summariseChartSetup([
    row("acc", ANY_SCOPE, { "axe-chart-theme": "dark" }, "x"),
  ]);
  assert.equal(setup.scopes, 0);
  assert.deepEqual(setup.symbols, []);
});

console.log("\nwiring");

check("the brief states the real setup, and says so when there is none", () => {
  const brief = codeOnly(read("src/services/axeDailyBriefingService.ts"));
  assert.ok(/How they read a chart/.test(brief));
  assert.ok(/describeChartSetup/.test(brief));
  assert.ok(
    !/standard set/.test(brief),
    '"standard set" reads like a fact about the trader and was not one',
  );
  const full = read("src/services/axeDailyBriefingService.ts");
  assert.ok(
    /do not name any indicator as theirs/.test(full),
    "an empty setup has to stop the model inventing one",
  );
});

check("the chart writes locally first and pushes after", () => {
  const screen = codeOnly(read("src/components/chart/ChartScreen.tsx"));
  const savePref = screen.slice(screen.indexOf("const savePref = useCallback"));
  const localAt = savePref.indexOf("writeSymbolPref(accountId, data.symbol, key, value)");
  const pushAt = savePref.indexOf("pushChartPrefs(accountId, data.symbol)");
  assert.ok(localAt > -1 && pushAt > localAt, "the chart must never wait on a network call to redraw");
});

check("adopting the server's setup makes the toggles re-read", () => {
  const screen = read("src/components/chart/ChartScreen.tsx");
  assert.ok(/pullChartPrefs\(\)/.test(screen));
  assert.ok(
    /\[accountId, data\.symbol, syncedPrefs\]/.test(screen),
    "without it the indicator toggles keep this device's state after a pull",
  );
});

check("a failed sync leaves the chart exactly as it was", () => {
  const prefs = read("src/lib/accountPreferences.ts");
  const pull = prefs.slice(prefs.indexOf("export async function pullChartPrefs"));
  assert.ok(/catch \{\s*return \[\];/.test(pull), "a failed pull must change nothing");
  assert.ok(/if \(!res\.ok\) return \[\];/.test(pull));
  // The stamp is written before the request so a lost response does not make
  // this device adopt the server's older copy on the next pull.
  const push = prefs.slice(prefs.indexOf("export function pushChartPrefs"));
  const stampAt = push.indexOf("localStorage.setItem(stampKey");
  const fetchAt = push.indexOf("void fetch(");
  assert.ok(stampAt > -1 && fetchAt > stampAt, "stamp before the request, not after");
});

check("the sync reads scoped values, never the global fallback", () => {
  const prefs = read("src/lib/accountPreferences.ts");
  const local = prefs.slice(prefs.indexOf("function localScope"));
  assert.ok(
    !/readPref\(/.test(local.slice(0, local.indexOf("function applyScope"))),
    "readPref falls back to the global value, which would upload another scope's setup",
  );
});

check("the route reads as the trader, so RLS is what enforces privacy", () => {
  const route = read("src/app/api/preferences/chart/route.ts");
  assert.ok(/createServerSupabaseClient/.test(route));
  assert.ok(
    !/serviceSupabase|SERVICE_ROLE/.test(route),
    "a chart setup is personal; the service role would make an .eq() the only guard",
  );
  assert.ok(/sanitisePrefs/.test(route), "allowlisted keys on the way in");
  assert.ok(/MAX_SCOPES_PER_WRITE/.test(route));
});

check("a failed read is not reported as an empty setup", () => {
  const route = read("src/app/api/preferences/chart/route.ts");
  assert.ok(
    /Could not read your chart setup/.test(route),
    "a chart silently resetting to defaults looks like a design decision, so nobody reports it",
  );
});

check("the migration locks the table to its owner", () => {
  const sql = read("supabase/migrations/20261021060000_user_chart_preferences.sql");
  assert.ok(/enable row level security/.test(sql));
  for (const cmd of ["select", "insert", "update", "delete"]) {
    assert.ok(
      new RegExp(`for ${cmd}`).test(sql),
      `${cmd} needs its own policy — one blanket 'for all' widens on the next edit`,
    );
  }
  assert.ok(/auth\.uid\(\) = user_id/.test(sql));
  assert.ok(/revoke all on table public\.user_chart_preferences from anon/.test(sql));
  assert.ok(!/to anon/.test(sql), "anon has no business in a personal chart setup");
});

check("the new route has a decided tier", () => {
  const features = read("src/lib/billing/routeFeatures.ts");
  assert.ok(/"preferences\/chart"/.test(features), "see verify-tier-gates");
});

console.log(`\n${passed} checks passed`);
