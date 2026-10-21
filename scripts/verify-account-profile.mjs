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
import { FIRMS, buildAccountProfile, newsWarningFor } from "../src/lib/risk/accountProfile.ts";

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

check("a guessed prop profile admits it is a guess, and says what it needs", () => {
  // FTMO's daily limit is 3% on its 1-Step and Instant accounts and 5% on its
  // 2-Step, so "FTMO Funded 100K" genuinely cannot be resolved. The old copy
  // said "assumed from the account name", which is true but useless. Naming
  // the models turns it into a question the trader can answer in one tap.
  const p = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
  assert.match(p.description, /strictest of FTMO's accounts/);
  assert.match(p.description, /2-Step, 1-Step, Instant/);
  assert.equal(p.firm.name, "FTMO");
  assert.equal(p.firm.model, null, "no model matched, so no model's rulebook is claimed");
  assert.equal(p.firm.rulesAreTightestAcrossModels, true);
  assert.deepEqual(p.firm.unresolvedModels, ["2-Step", "1-Step", "Instant"]);
  // The tightest of 3%, 3% and 5%. More careful than any real FTMO account.
  assert.equal(p.maxDailyLossPct, 3);
  // Agreed across all three models, so it survives the combination; the total
  // basis does not, because static and trailing are not the same rule.
  assert.equal(p.maxDailyLossBasis, "day_start_balance");
  assert.equal(p.maxTotalLossBasis, null);
});

check("naming the model gets the firm's real numbers, with the basis", () => {
  const twoStep = buildAccountProfile({ label: "FTMO 2-Step 100K", mt5Server: "FTMO-Server" });
  assert.equal(twoStep.maxDailyLossPct, 5);
  assert.equal(twoStep.maxTotalLossPct, 10);
  assert.equal(twoStep.maxTotalLossBasis, "initial_balance", "the 2-Step cap is static");
  assert.equal(twoStep.provenance.maxDailyLossPct, "firm");

  const oneStep = buildAccountProfile({ label: "FTMO 1-Step 50K", mt5Server: "FTMO-Server" });
  assert.equal(oneStep.maxDailyLossPct, 3, "a different model is a different limit");
  assert.equal(
    oneStep.maxTotalLossBasis,
    "trailing_eod_balance",
    "both caps read '10%' — static versus trailing is the part that costs the account",
  );
  assert.match(oneStep.description, /from FTMO's published rules/);
});

check("the tightest fallback can only be stricter than the real rulebook", () => {
  const unresolved = buildAccountProfile({ mt5Server: "FTMO-Server" });
  for (const model of ["2-Step", "1-Step", "Instant"]) {
    const exact = buildAccountProfile({ mt5Server: "FTMO-Server", metadata: { firmModel: model } });
    assert.ok(
      unresolved.maxDailyLossPct <= exact.maxDailyLossPct,
      `${model}: the fallback must never allow more than the model does`,
    );
    assert.ok(unresolved.maxTotalLossPct <= exact.maxTotalLossPct, `${model}: same for the total cap`);
  }
});

check("a firm whose rulebook we have not read says exactly that", () => {
  const p = buildAccountProfile({ label: "Goat Funded Trader 25K", mt5Server: "GoatFundedTrader-Live" });
  assert.equal(p.firm.name, "Goat Funded Trader");
  assert.equal(p.firm.rules, null);
  assert.match(p.description, /limits not confirmed for Goat Funded Trader/);
  // Recognised still beats unknown: the rails are on, just labelled a guess.
  assert.equal(p.newsTradingAllowed, false);
  assert.equal(p.provenance.maxDailyLossPct, "default");
});

check("overriding the number drops the firm's basis instead of keeping it", () => {
  // The trader read 4% off their own dashboard. We have no idea what that 4%
  // is measured from, and claiming the firm's basis would invent the
  // load-bearing half of the rule.
  const p = buildAccountProfile({
    label: "Upcomers Oracle 200K",
    mt5Server: "Upcomers",
    metadata: { tradingRules: { maxDailyLossPct: 4 } },
  });
  assert.equal(p.maxDailyLossPct, 4);
  assert.equal(p.maxDailyLossBasis, null);
  assert.equal(p.provenance.maxDailyLossBasis, "stated");
});

check("Upcomers Oracle keeps the rules read from its own help pages", () => {
  const p = buildAccountProfile({ label: "Upcomers Oracle 200K", mt5Server: "Upcomers" });
  assert.equal(p.maxDailyLossPct, 4, "4%, not the generic 5% — on $200k that gap is $2,000");
  assert.equal(p.maxDailyLossBasis, "day_start_equity");
  assert.equal(p.newsTradingAllowed, true, "Upcomers allows it where the generic guess does not");
  assert.equal(p.weekendHoldingAllowed, true);
  assert.equal(p.provenance.newsTradingAllowed, "firm");
});

check("every firm rule carries where it came from and when", () => {
  for (const firm of FIRMS) {
    for (const model of firm.models) {
      assert.ok(/^https?:\/\//.test(model.source), `${firm.id} ${model.model}: source must be a URL`);
      assert.match(model.asOf, /^\d{4}-\d{2}-\d{2}$/, `${firm.id} ${model.model}: needs a read date`);
      // A percentage without its basis is a number, not a rule.
      if (model.maxDailyLossPct !== null) {
        assert.ok(model.maxDailyLossBasis, `${firm.id} ${model.model}: daily % needs a basis`);
      }
      if (model.maxTotalLossPct !== null) {
        assert.ok(model.maxTotalLossBasis, `${firm.id} ${model.model}: total % needs a basis`);
      }
    }
  }
});

check("a firm field nobody could source stays null rather than becoming plausible", () => {
  // FTMO's drawdown table is public and exact. Its news and weekend rules are
  // not on it, and third-party guides gave a 2-minute window in one place and
  // 4 in another — which is the whole reason these are null.
  const ftmo = FIRMS.find((f) => f.id === "ftmo");
  for (const model of ftmo.models) {
    assert.equal(model.newsTradingAllowed, null, `${model.model}: not confirmed, so not asserted`);
    assert.equal(model.weekendHoldingAllowed, null);
  }
  // And the cautious default still applies, marked as a default.
  const p = buildAccountProfile({ label: "FTMO 2-Step 100K", mt5Server: "FTMO-Server" });
  assert.equal(p.newsTradingAllowed, false);
  assert.equal(p.provenance.newsTradingAllowed, "default");
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
