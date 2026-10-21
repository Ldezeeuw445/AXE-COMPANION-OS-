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
  FIRMS,
  buildAccountProfile,
  detectFirm,
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

check("an unnamed model gets the strictest of the firm's, not the generic guess", () => {
  // FTMO's daily limit is 3% on its 1-Step and Instant and 5% on its 2-Step.
  // "FTMO Challenge" does not say which, so AXE takes the 3%: it can only be
  // more careful than the real rulebook, never less. Falling back to the
  // generic 5% here would have handed back a limit looser than any FTMO
  // account actually has.
  const p = buildAccountProfile({ label: "FTMO Challenge", mt5Server: "FTMO-Server2", metadata: null });
  assert.equal(p.maxDailyLossPct, 3);
  assert.equal(p.maxTotalLossPct, 10);
  // All three FTMO models take the daily limit from the day's opening
  // balance, so that half of the rule holds whichever model this is. They
  // disagree on the total — static, end-of-day trailing, intraday trailing —
  // and a basis is not something to guess at, so that one comes back blank.
  assert.equal(p.maxDailyLossBasis, "day_start_balance");
  assert.equal(p.maxTotalLossBasis, null);
  assert.equal(p.newsTradingAllowed, false, "unconfirmed stays careful");
  assert.equal(p.weekendHoldingAllowed, false);
  assert.match(p.description, /strictest of FTMO's accounts/);
});

check("a firm whose rulebook nobody has read keeps the careful default", () => {
  const p = buildAccountProfile({ label: "Maven 100K", mt5Server: "Maven-Live", metadata: null });
  assert.equal(p.maxDailyLossPct, 5, "the generic prop default, and labelled as one");
  assert.equal(p.provenance.maxDailyLossPct, "default");
  assert.equal(p.newsTradingAllowed, false);
  assert.match(p.description, /limits not confirmed for Maven Trading/);
});

check("every firm rule says where its numbers came from, and when", () => {
  // A firm can change its rulebook and this file cannot notice. Without a
  // source and a date, a stale number is indistinguishable from a fresh one.
  for (const firm of FIRMS) {
    assert.ok(firm.id === firm.id.toLowerCase(), `${firm.id} must be a lower-case id`);
    for (const model of firm.models) {
      assert.ok(/^https?:\/\//.test(model.source), `${firm.id} ${model.model} needs a real source`);
      assert.match(model.asOf, /^\d{4}-\d{2}-\d{2}$/, `${firm.id} needs a date it was read`);
    }
  }
  assert.ok(detectFirm({ mt5Server: "Upcomers" }), "matched on the server alone");
  assert.equal(detectFirm({ mt5Server: "Pepperstone-Live01" }), null);
});

check("naming the model in metadata is enough to resolve the firm's rules", () => {
  // This is the whole point of storing `firmModel`: one tap on a list AXE
  // already knows, instead of the trader typing their firm's rulebook in.
  const before = detectFirm({ mt5Server: "FTMO-Server" });
  assert.equal(before.model, null, "FTMO alone cannot say which model this is");
  assert.equal(before.rulesAreTightestAcrossModels, true);
  assert.equal(before.rules.maxDailyLossPct, 3, "so it takes the strictest until told");
  assert.deepEqual(before.unresolvedModels, ["2-Step", "1-Step", "Instant"]);

  const after = detectFirm({ mt5Server: "FTMO-Server", metadata: { firmModel: "1-Step" } });
  assert.equal(after.model, "1-Step");
  assert.equal(after.rules.maxDailyLossPct, 3);
  assert.equal(after.rules.maxTotalLossBasis, "trailing_eod_balance");
});

check("naming the model does not make the profile claim the trader stated rules", () => {
  // `explicit` drives the "assumed" wording and the guard's trust. Picking
  // your account model is not stating a limit, so it must stay false.
  const p = buildAccountProfile({
    mt5Server: "FTMO-Server",
    metadata: { firmModel: "2-Step" },
  });
  assert.equal(p.explicit, false);
  assert.equal(p.provenance.maxDailyLossPct, "firm");
  assert.equal(p.maxDailyLossPct, 5);
});

check("a model name cannot be used to smuggle another firm's rules in", () => {
  // It lands in the string every firm pattern is matched against, and it
  // arrives in a request body.
  const rules = parseAccountRules({ firmModel: "x".repeat(500) });
  assert.ok(rules.firmModel.length <= 40, "length-capped where it is parsed");
  assert.equal(parseAccountRules({ firmModel: "   " }).firmModel, null);
  assert.equal(parseAccountRules({ firmModel: 42 }).firmModel, null);
  // The firm itself still comes from the server name, so a model naming a
  // different firm cannot move the account to that firm.
  const p = detectFirm({ mt5Server: "Upcomers", metadata: { firmModel: "FTMO 2-Step" } });
  assert.equal(p.id, "upcomers", "the server name decides the firm, not the model field");
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
  // It is still not the trader's word, but "assumed from the account name" was
  // the wrong admission: these numbers were read off Upcomers' own help pages.
  // Saying which of the two it is, is the difference between a number a trader
  // trusts and one they switch off.
  assert.match(unstated.description, /from Upcomers' published rules/);
  assert.equal(unstated.provenance.maxDailyLossPct, "firm");
});

check("every profile says where it got its numbers", () => {
  // A trader has to be able to tell three things apart: a rule they set, a
  // number read off the firm's own page, and a blanket guess. One phrase for
  // all three — the old "assumed from the account name" — is what makes people
  // switch the rails off.
  const fromFirm = buildAccountProfile({ label: "Oracle $200k", mt5Server: "Upcomers", metadata: null });
  assert.equal(fromFirm.explicit, false);
  assert.match(fromFirm.description, /from Upcomers' published rules/);

  const guessed = buildAccountProfile({ label: "Maven 50K", mt5Server: "Maven-Live", metadata: null });
  assert.equal(guessed.explicit, false);
  assert.match(guessed.description, /limits not confirmed for Maven Trading/);

  const stated = buildAccountProfile({
    label: "Maven 50K",
    mt5Server: "Maven-Live",
    metadata: { tradingRules: { maxDailyLossPct: 4 } },
  });
  assert.equal(stated.explicit, true);
  assert.ok(
    !/assumed|not confirmed|strictest/.test(stated.description),
    "stop hedging once the trader has told you",
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

check("the panel labels every limit with where it came from", () => {
  const panel = read("src/components/settings/AccountRulesPanel.tsx");
  // One word for all three — the old "a guess, until you state otherwise" —
  // could not distinguish a number read off FTMO's own page from a blanket
  // assumption, so a trader had no way to know which of their rails to trust.
  assert.ok(/SourceBadge/.test(panel));
  assert.ok(/"you said"/.test(panel));
  assert.ok(/"assumed"/.test(panel));
  assert.ok(/profile\.provenance\[r\.key\]/.test(panel), "per field, not per account");
  // And where the numbers came from, so the trader can check them in ten
  // seconds — prop firms change their rulebooks.
  assert.ok(/Source: \{firm\.source\}/.test(panel));
});

check("the panel asks which model instead of making the trader type the rules", () => {
  const panel = read("src/components/settings/AccountRulesPanel.tsx");
  // The complaint this answers: a trader who already chose their firm, paid
  // their firm and passed their firm's evaluation should not then copy the
  // firm's rulebook into an app. One tap on a list AXE already knows.
  assert.ok(/Which \{firm\.name\} account is this\?/.test(panel));
  assert.ok(/onPickModel\(model\)/.test(panel), "the models are buttons");
  assert.ok(/onPickModel\(null\)/.test(panel), "and the answer is reversible");
  assert.ok(
    /const pickModel = useCallback/.test(panel),
    "it saves on tap — leaving it to Save would show the old numbers next to the new model",
  );
  // Total drawdown is the rule that ends an account, and it had no field.
  assert.ok(/Max total drawdown/.test(panel));
});

check("the route is classified for the tier gate", () => {
  const features = read("src/lib/billing/routeFeatures.ts");
  assert.ok(
    /"preferences\/account-rules"/.test(features),
    "a new route needs a decided tier; see verify-tier-gates",
  );
});

console.log(`\n${passed} checks passed`);
