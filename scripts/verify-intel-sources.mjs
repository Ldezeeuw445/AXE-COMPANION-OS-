/**
 * An unsubscribed source is not a broken one.
 *
 * `intel-warmup` reported `warmed: 3, failed: 6` every thirty minutes, and had
 * for a long time. Five of those six are Unusual Whales endpoints for a
 * subscription that was never bought. A check that is permanently red is not a
 * warning, it is wallpaper — and it hides the day a feed that *should* work
 * stops working.
 *
 * Also guards the Krater removal: that integration's key was never set on the
 * host, the local generator was already writing both broadcasts, and the API
 * did not expose the endpoints the old code polled.
 *
 * Run: node scripts/verify-intel-sources.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  actionAvailability,
  availableIntelActions,
  isSourceAvailable,
  INTEL_ACTION_SOURCE,
} from "../src/lib/intel/intelSources.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const OFF = {};
const ON = { UNUSUAL_WHALES_ENABLED: "true" };
// Everything configured: the UW subscription *and* the Alpha Vantage key that
// senateTrades moved onto.
const ALL_ON = { UNUSUAL_WHALES_ENABLED: "true", ALPHAVANTAGE_API_KEY: "k" };

console.log("intel sources");

check("the remaining Unusual Whales actions are skipped while unsubscribed", () => {
  // senateTrades used to be on this list. It moved to Alpha Vantage, which
  // serves the same STOCK Act disclosures for free — see the check below.
  for (const action of ["darkPoolPrints", "unusualOptions", "marketTide"]) {
    const a = actionAvailability(action, OFF);
    assert.equal(a.available, false, `${action} should be skipped`);
    assert.match(a.reason, /Unusual Whales is not subscribed/);
  }
});

check("free sources keep running", () => {
  for (const action of ["corporateJets", "vesselStream", "gdeltEvents", "openSourcesBrief"]) {
    assert.equal(actionAvailability(action, OFF).available, true, `${action} needs no key`);
  }
});

check("insider trades stay on — SEC EDGAR is free", () => {
  assert.equal(INTEL_ACTION_SOURCE.insiderTrades, "free");
  assert.equal(actionAvailability("insiderTrades", OFF).available, true);
});

check("one flag turns the paid source back on", () => {
  assert.equal(isSourceAvailable("unusual_whales", OFF), false);
  assert.equal(isSourceAvailable("unusual_whales", ON), true);
  assert.equal(actionAvailability("marketTide", ON).available, true);
});

check("the flag is explicit — a stray value does not enable it", () => {
  for (const v of ["", "1", "yes", "TRUE ", undefined]) {
    const on = isSourceAvailable("unusual_whales", { UNUSUAL_WHALES_ENABLED: v });
    assert.equal(on, String(v).trim().toLowerCase() === "true", `ambiguous for ${JSON.stringify(v)}`);
  }
});

check("an unknown action is treated as free, not silently dropped", () => {
  assert.equal(actionAvailability("somethingNew", OFF).available, true);
});

check("the warmup only calls what it can reach", () => {
  const all = Object.keys(INTEL_ACTION_SOURCE);
  // Four unconfigured: three Unusual Whales feeds plus senateTrades, which
  // now waits on an Alpha Vantage key instead.
  assert.equal(availableIntelActions(all, OFF).length, all.length - 4);
  // The UW switch alone no longer buys senateTrades back.
  assert.equal(availableIntelActions(all, ON).length, all.length - 1);
  assert.equal(availableIntelActions(all, ALL_ON).length, all.length);
});

check("skipped is reported apart from failed", () => {
  const src = readFileSync("src/services/intelWarmupService.ts", "utf8");
  assert.ok(/skipped: number/.test(src), "a skip counted as a failure is the whole problem");
  assert.ok(/skipped: true/.test(src));
  assert.ok(/ok: true, skipped: true/.test(src), "a deliberate skip is not an error");
});

console.log("krater removal");

check("the Krater service is gone, not just unused", () => {
  assert.ok(!existsSync("src/services/kraterFeedSyncService.ts"), "518 lines of dead polling");
});

check("both broadcasts are written locally", () => {
  const src = readFileSync("src/services/broadcastSyncService.ts", "utf8");
  assert.ok(/generateBroadcastLocally/.test(src));
  assert.ok(/source: "axe_local"/.test(src));
});

check("a name in a broadcast is still stripped", () => {
  // It goes to every user, so a name is wrong for all but one of them.
  const src = readFileSync("src/services/broadcastSyncService.ts", "utf8");
  assert.ok(/normalizeBroadcastBody/.test(src));
});

check("the retired webhook says gone, not not-found", () => {
  const src = readFileSync("src/app/api/webhooks/krater-feed/route.ts", "utf8");
  assert.ok(/status: 410/.test(src), "a URL handed to a third party should admit it existed");
});

check("no health endpoint still asks for a Krater key", () => {
  for (const f of ["src/app/api/debug/cron-health/route.ts", "src/app/api/internal/key-health/route.ts"]) {
    assert.ok(!/KRATER_API_KEY/.test(readFileSync(f, "utf8")), `${f} still chases a dead key`);
  }
});

check("senateTrades is off Unusual Whales and onto a free source", () => {
  assert.equal(INTEL_ACTION_SOURCE.senateTrades, "alphavantage");

  const off = actionAvailability("senateTrades", OFF);
  assert.equal(off.available, false, "no key means not configured");
  assert.match(off.reason, /ALPHAVANTAGE_API_KEY/, "say which key, and which cron fills it");
  assert.doesNotMatch(off.reason, /Unusual Whales/, "this feed no longer waits on that subscription");

  assert.equal(
    actionAvailability("senateTrades", { ALPHAVANTAGE_API_KEY: "k" }).available,
    true,
    "with the key it is available — this key is read by this process, so presence is a real answer",
  );
  // And the UW switch must not accidentally gate it any more.
  assert.equal(actionAvailability("senateTrades", { UNUSUAL_WHALES_ENABLED: "true" }).available, false);
});

console.log(`\n${passed} checks passed`);
