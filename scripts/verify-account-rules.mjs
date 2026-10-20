/**
 * The escape hatch that nothing could open.
 *
 * `accountProfile.ts` has said since it was written that anything stated in
 * `user_broker_accounts.metadata.tradingRules` wins over its heuristics.
 * Measured 2026-10-19: nothing in the codebase ever wrote that key. The guard
 * trusted a safety valve with no handle on it, so every account ran on a guess
 * made from its own name.
 *
 * It was found while connecting a real $200,000 Upcomers "Oracle" funded
 * account. That firm's server is literally `Upcomers` and its dashboard never
 * says "funded", so the classifier read the account as `unknown` — news
 * trading allowed, no daily loss limit, weekend holding allowed. Every rail
 * off. And its real daily limit is 4%, where the prop default is 5%: AXE would
 * have kept placing trades between 4% and 5% down, past the point where the
 * account was already breached.
 *
 * Run: node scripts/verify-account-rules.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KNOWN_FIRM_RULES,
  buildAccountProfile,
  knownFirmRules,
} from "../src/lib/risk/accountProfile.ts";
import {
  EMPTY_ACCOUNT_RULES,
  MAX_DAILY_LOSS_PCT_CEILING,
  MAX_LOT_CEILING,
  hasAnyRule,
  parseAccountRules,
  withTradingRules,
} from "../src/lib/trading/accountRules.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("account rules");

// ── the firm that started it ─────────────────────────────────────────────
check("an Upcomers account is never read as 'unknown'", () => {
  // The server string is all AXE gets when the label says nothing useful.
  for (const label of ["Oracle $200k", "$200,000 Oracle", "Upcomers", ""]) {
    const p = buildAccountProfile({ label, mt5Server: "Upcomers", metadata: null });
    assert.notEqual(p.kind, "unknown", `"${label}" on server Upcomers must not be unknown`);
    // It used to assert news and weekend were both off — the careful guess for
    // a prop account nobody had read the rulebook of. We have read this one:
    // Upcomers allows both. What must never come back is "no limit at all".
    assert.ok(p.maxDailyLossPct !== null, "a prop account must have a daily loss limit");
    assert.equal(p.maxDailyLossPct, 4, "and for Upcomers it is their 4%, not the generic 5%");
  }
});

check("a firm whose rulebook we read gets its own numbers", () => {
  // The generic prop default is 5% daily, news off, weekend off. For Upcomers
  // Oracle that is wrong in the one direction that costs money: its daily
  // limit is 4%, so AXE would have kept trading between 4% and 5% down — past
  // the point where the firm had already closed the account.
  const p = buildAccountProfile({ label: "Oracle $200k", mt5Server: "Upcomers", metadata: null });
  assert.equal(p.maxDailyLossPct, 4, "the firm's own number, not the generic 5%");
  assert.equal(p.newsTradingAllowed, true, "Upcomers allows news trading");
  assert.equal(p.weekendHoldingAllowed, true, "and weekend holding");
});

check("a firm we have not read keeps the careful guess", () => {
  const p = buildAccountProfile({ label: "FTMO Challenge", mt5Server: "FTMO-Server2", metadata: null });
  assert.equal(p.maxDailyLossPct, 5);
  assert.equal(p.newsTradingAllowed, false, "unknown stays careful");
  assert.equal(p.weekendHoldingAllowed, false);
});

check("every known firm says where its numbers came from, and when", () => {
  // A firm can change its rulebook and this file cannot notice. Without a
  // source and a date, a stale number is indistinguishable from a fresh one.
  for (const [firm, rules] of Object.entries(KNOWN_FIRM_RULES)) {
    assert.ok(rules.source && rules.source.length > 20, `${firm} needs a real source`);
    assert.match(rules.asOf, /^\d{4}-\d{2}-\d{2}$/, `${firm} needs a date it was read`);
    assert.equal(firm, firm.toLowerCase(), "matched case-insensitively against label + server");
  }
  assert.ok(knownFirmRules({ mt5Server: "Upcomers" }), "matched on the server alone");
  assert.equal(knownFirmRules({ mt5Server: "Pepperstone-Live01" }), null);
});

check("a firm rule is still a guess, and still loses to the trader", () => {
  // Being in the table does not make it a verdict. The trader's own word wins,
  // and the description keeps saying the rest was assumed.
  const stated = buildAccountProfile({
    label: "Oracle $200k",
    mt5Server: "Upcomers",
    metadata: { tradingRules: { maxDailyLossPct: 3 } },
  });
  assert.equal(stated.maxDailyLossPct, 3, "what the trader states wins over the firm table");
  assert.equal(stated.explicit, true);

  const unstated = buildAccountProfile({ label: "Oracle $200k", mt5Server: "Upcomers", metadata: null });
  assert.equal(unstated.explicit, false, "a firm rule is not something the trader said");
  assert.ok(/assumed from the account name/.test(unstated.description));
});

check("the guess announces itself as a guess", () => {
  const p = buildAccountProfile({ label: "Oracle $200k", mt5Server: "Upcomers", metadata: null });
  assert.equal(p.explicit, false);
  assert.ok(
    /assumed from the account name/.test(p.description),
    "a trader must be able to tell a guess from a rule they set",
  );
});

// ── stating the real rules ───────────────────────────────────────────────
check("what the trader states beats the guess, in both directions", () => {
  // Upcomers Oracle, measured against the firm's own help centre on
  // 2026-10-19: 4% daily, news allowed, weekend allowed. The guess is wrong on
  // all three, and the 5% is the dangerous one.
  const metadata = withTradingRules(
    { metaapiRegion: "london", passwordType: "master" },
    parseAccountRules({
      maxDailyLossPct: 4,
      newsTradingAllowed: true,
      weekendHoldingAllowed: true,
    }),
  );
  const p = buildAccountProfile({ label: "Oracle $200k", mt5Server: "Upcomers", metadata });
  assert.equal(p.maxDailyLossPct, 4, "the stated 4% must win over the assumed 5%");
  assert.equal(p.newsTradingAllowed, true);
  assert.equal(p.weekendHoldingAllowed, true);
  assert.equal(p.explicit, true);
  assert.ok(!/assumed/.test(p.description), "a stated rule is not a guess any more");
});

check("stating rules does not wipe the connection's own metadata", () => {
  // That blob carries MetaApi's region, password type and provisioning
  // probes. Overwriting it would break the connection the trader just made.
  const before = {
    metaapiRegion: "london",
    passwordType: "master",
    metaApiComplianceConfirmed: true,
    createdVia: "axe_companion_cloud_mt5",
  };
  const after = withTradingRules(before, parseAccountRules({ maxDailyLossPct: 4 }));
  for (const key of Object.keys(before)) {
    assert.equal(after[key], before[key], `${key} must survive`);
  }
  assert.deepEqual(after.tradingRules, { maxDailyLossPct: 4 });
  assert.ok(typeof after.tradingRulesStatedAt === "string", "stamp when it was stated");
});

check("'not stated' is not the same as 'stated as off'", () => {
  // A checkbox would turn silence into a claim. Only keys the trader actually
  // answered are written, so buildAccountProfile's `explicit` stays honest.
  const rules = parseAccountRules({ maxDailyLossPct: 4 });
  assert.equal(rules.newsTradingAllowed, null);
  const meta = withTradingRules(null, rules);
  assert.ok(!("newsTradingAllowed" in meta.tradingRules), "an unanswered rule is absent, not false");

  // And a profile built from it keeps the default for the rest. A firm that is
  // NOT in KNOWN_FIRM_RULES, so the thing being tested is the fallback and not
  // somebody's published rulebook.
  const p = buildAccountProfile({ label: "FTMO Challenge", mt5Server: "FTMO-Server2", metadata: meta });
  assert.equal(p.newsTradingAllowed, false, "unstated stays careful");
  assert.equal(p.maxDailyLossPct, 4, "stated wins");
});

check("clearing every rule removes the key rather than leaving an empty one", () => {
  const meta = withTradingRules({ tradingRules: { maxLot: 2 }, other: 1 }, EMPTY_ACCOUNT_RULES);
  assert.ok(!("tradingRules" in meta), "an empty rule set is no rule set");
  assert.equal(meta.other, 1);
});

check("a typo cannot become a licence", () => {
  const r = parseAccountRules({ maxDailyLossPct: 900, maxLot: 9999 });
  assert.equal(r.maxDailyLossPct, MAX_DAILY_LOSS_PCT_CEILING);
  assert.equal(r.maxLot, MAX_LOT_CEILING);
  for (const bad of [0, -1, "", "abc", null, undefined, NaN]) {
    assert.equal(parseAccountRules({ maxDailyLossPct: bad }).maxDailyLossPct, null);
  }
  assert.deepEqual(parseAccountRules(null), EMPTY_ACCOUNT_RULES);
  assert.deepEqual(parseAccountRules("nope"), EMPTY_ACCOUNT_RULES);
  assert.deepEqual(parseAccountRules([1, 2]), EMPTY_ACCOUNT_RULES);
  assert.ok(!hasAnyRule(EMPTY_ACCOUNT_RULES));
  assert.ok(hasAnyRule({ ...EMPTY_ACCOUNT_RULES, maxLot: 1 }));
});

check("yes/no arrive as booleans whichever way they are written", () => {
  assert.equal(parseAccountRules({ newsTradingAllowed: "true" }).newsTradingAllowed, true);
  assert.equal(parseAccountRules({ newsTradingAllowed: "no" }).newsTradingAllowed, false);
  assert.equal(parseAccountRules({ newsTradingAllowed: "maybe" }).newsTradingAllowed, null);
});

// ── it is reachable ──────────────────────────────────────────────────────
check("something actually writes tradingRules now", () => {
  // The whole point. Before 2026-10-19 this assertion would have failed.
  const route = read("src/app/api/preferences/account-rules/route.ts");
  assert.ok(route.includes("withTradingRules("), "the route must write the key");
  assert.ok(
    /\.eq\("user_id", user\.id\)[\s\S]{0,120}\.eq\("id", accountId\)/.test(route),
    "scoped to the caller's own accounts",
  );
  assert.ok(route.includes('"No such account."'), "somebody else's id is a 404, not a silent no-op");

  const panel = read("src/components/settings/AccountRulesPanel.tsx");
  assert.ok(panel.includes('fetch("/api/preferences/account-rules"'), "and a panel must reach it");
  assert.ok(/Not stated/.test(panel), "the third state has to exist in the UI too");

  const settings = read("src/app/(app)/settings/page.tsx");
  assert.ok(settings.includes("<AccountRulesPanel />"), "mounted where a trader will find it");
});

check("the panel shows whether the number protecting them is a guess", () => {
  const panel = read("src/components/settings/AccountRulesPanel.tsx");
  assert.ok(panel.includes("profile.explicit"), "say which rules are stated and which are assumed");
  assert.ok(/a guess, until you state otherwise/.test(panel));
});

check("the route is classified for the tier gate", () => {
  const features = read("src/lib/billing/routeFeatures.ts");
  assert.ok(
    /"preferences\/account-rules"/.test(features),
    "a new route needs a decided tier; see verify-tier-gates",
  );
});

console.log(`\n${passed} checks passed`);
