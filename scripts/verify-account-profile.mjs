/**
 * Verification for src/lib/risk/accountProfile.ts and the news rule it feeds.
 *
 * The case that matters: a funded account with no position open. The old rule
 * only fired when something was already open, which is precisely backwards —
 * on a funded account the useful moment is before the trade, while staying
 * flat is still a choice.
 *
 * Run: node scripts/verify-account-profile.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAccountProfile, newsWarningFor } from "../src/lib/risk/accountProfile.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("accountProfile");

check("a funded prop account is not a demo account", () => {
  const funded = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
  assert.equal(funded.kind, "prop_funded");
  assert.equal(funded.newsTradingAllowed, false);
  assert.equal(funded.weekendHoldingAllowed, false);

  const demo = buildAccountProfile({ label: "MT5 DEMO 500K", mt5Server: "MetaQuotes-Demo" });
  assert.equal(demo.kind, "demo");
  assert.equal(demo.newsTradingAllowed, true, "a demo account has nothing to lose to NFP");
});

check("a challenge is read as an evaluation, not as funded", () => {
  const p = buildAccountProfile({ label: "FTMO Challenge Phase 1", mt5Server: "FTMO-Demo" });
  assert.equal(p.kind, "prop_evaluation");
  assert.equal(p.newsTradingAllowed, false);
});

check("a bare prop firm name errs toward the stricter reading", () => {
  const p = buildAccountProfile({ label: "The5ers account", mt5Server: null });
  assert.equal(p.kind, "prop_evaluation");
  assert.equal(p.newsTradingAllowed, false);
});

check("what the trader states beats every guess", () => {
  const p = buildAccountProfile({
    label: "FTMO Funded 100K",
    mt5Server: "FTMO-Server",
    metadata: { tradingRules: { newsTradingAllowed: true, maxLot: 2.5, maxDailyLossPct: 4 } },
  });
  assert.equal(p.newsTradingAllowed, true, "an explicit permission must win");
  assert.equal(p.maxLot, 2.5);
  assert.equal(p.maxDailyLossPct, 4);
  assert.equal(p.explicit, true);
  assert.ok(!p.description.includes("assumed"), "stop guessing once you have been told");
});

check("a guessed prop profile admits it is a guess", () => {
  const p = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
  assert.match(p.description, /assumed from the account name/);
});

check("an empty account is unknown, not silently live", () => {
  const p = buildAccountProfile({ label: null, mt5Server: null });
  assert.equal(p.kind, "unknown");
});

console.log("news warning");

const funded = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
const demo = buildAccountProfile({ label: "MT5 DEMO 500K", mt5Server: "MetaQuotes-Demo" });

check("funded + flat + red news incoming → AXE speaks up anyway", () => {
  const w = newsWarningFor(funded, {
    openPositions: 0,
    minutesUntil: 22,
    eventTitle: "Non-Farm Payrolls",
    currency: "USD",
  });
  assert.ok(w, "this is the exact case the old rule stayed silent on");
  assert.match(w.title, /USD Non-Farm Payrolls/);
  assert.match(w.body, /funded prop account/);
  assert.match(w.body, /stay flat/);
});

check("funded + open positions names how many", () => {
  const w = newsWarningFor(funded, {
    openPositions: 2,
    minutesUntil: 10,
    eventTitle: "CPI",
    currency: "USD",
  });
  assert.match(w.body, /2 open positions/);
});

check("demo + flat → silence, because there is nothing to warn about", () => {
  assert.equal(
    newsWarningFor(demo, { openPositions: 0, minutesUntil: 20, eventTitle: "CPI", currency: "USD" }),
    null,
  );
});

check("demo + open positions still gets the plain warning", () => {
  const w = newsWarningFor(demo, {
    openPositions: 1,
    minutesUntil: 20,
    eventTitle: "CPI",
    currency: "USD",
  });
  assert.ok(w);
  assert.match(w.body, /1 open position\b/);
});

check("an event further out than 45 minutes is not yet news", () => {
  assert.equal(
    newsWarningFor(funded, { openPositions: 0, minutesUntil: 120, eventTitle: "CPI" }),
    null,
  );
});

console.log("watcher wiring");

const watcher = readFileSync("src/services/axeProactiveWatcher.ts", "utf8");

check("the news rule is no longer gated on open positions", () => {
  assert.ok(
    !/if \(positions\.length > 0\) \{\n    const symbols/.test(watcher),
    "the position gate is back",
  );
  assert.ok(/!accountProfile\.newsTradingAllowed/.test(watcher));
});

check("declining push no longer removes you from the watcher entirely", () => {
  const firstSource = watcher.indexOf('.from("user_broker_accounts")');
  const pushSource = watcher.indexOf('.from("push_subscriptions")');
  assert.ok(firstSource > 0 && pushSource > 0);
  assert.ok(
    firstSource < pushSource,
    "push must not be the primary source — it decides delivery, not eligibility",
  );
});

console.log(`\n${passed} checks passed`);
