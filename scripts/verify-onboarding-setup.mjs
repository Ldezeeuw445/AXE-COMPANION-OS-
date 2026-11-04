/**
 * What onboarding says is still missing — and that it never claims otherwise.
 *
 * Build-list item 10.1: *"Onboarding: tier kiezen → eigen MT5 koppelen, in één
 * flow."* The flow used to end at `router.replace("/chart")` with the trader's
 * preferences saved and nothing else. No broker account, no plan, and nothing
 * anywhere saying either existed — so they landed on an empty chart and had to
 * work out for themselves what the app was waiting for.
 *
 * The failure mode that matters is not "the step is missing". It is the step
 * being present and lying: telling someone with nothing connected that they
 * are all set, because a fetch had not answered yet. That is what most of
 * these checks are about.
 *
 * Run: node scripts/verify-onboarding-setup.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describeSetupGaps, hasSetupGaps } from "../src/lib/onboarding/setupState.ts";
import { AXE_BILLING_TIERS } from "../src/lib/billing/tiers.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const fresh = { plan: "free", isPaid: false, tradingAccounts: 0 };
const connectedFree = { plan: "free", isPaid: false, tradingAccounts: 1 };
const paidNoAccount = { plan: "pro", isPaid: true, tradingAccounts: 0 };
const ready = { plan: "pro", isPaid: true, tradingAccounts: 2 };

console.log("what is still missing");

check("a brand-new account is missing both things", () => {
  const gaps = describeSetupGaps(fresh);
  assert.deepEqual(gaps.map((g) => g.id), ["trading-account", "plan"]);
  assert.equal(hasSetupGaps(fresh), true);
});

check("the account comes before the paywall", () => {
  // The easy inversion is to lead with the upgrade. It would also be a lie
  // about which one actually stops them: on Free most of the app works, with
  // no broker none of it has any data.
  const gaps = describeSetupGaps(fresh);
  assert.equal(gaps[0].id, "trading-account", "money must not jump the queue");
});

check("connecting an account removes that gap and leaves the other", () => {
  const gaps = describeSetupGaps(connectedFree);
  assert.deepEqual(gaps.map((g) => g.id), ["plan"]);
});

check("paying removes the plan gap and leaves the other", () => {
  const gaps = describeSetupGaps(paidNoAccount);
  assert.deepEqual(gaps.map((g) => g.id), ["trading-account"]);
});

check("someone who is genuinely set up is told nothing", () => {
  assert.deepEqual(describeSetupGaps(ready), []);
  assert.equal(hasSetupGaps(ready), false);
});

console.log("\nhow it says it");

check("every gap says what stops working, not what to buy", () => {
  for (const facts of [fresh, connectedFree, paidNoAccount]) {
    for (const gap of describeSetupGaps(facts)) {
      assert.ok(gap.consequence.length > 60, `too thin to be honest: "${gap.consequence}"`);
      assert.ok(
        !/unlock|supercharge|full potential|take .* to the next level|don't miss/i.test(
          gap.consequence,
        ),
        `that is a sales line, not a consequence: "${gap.consequence}"`,
      );
    }
  }
});

check("the free-plan line is read from the tier list, not retyped", () => {
  // A cap that drifts from tiers.ts is a promise the app does not keep.
  const free = AXE_BILLING_TIERS.find((t) => t.id === "free");
  const gap = describeSetupGaps(fresh).find((g) => g.id === "plan");
  assert.ok(free.dailyChatCap, "the free tier should have a cap to quote");
  assert.ok(
    gap.consequence.includes(String(free.dailyChatCap)),
    `the real cap (${free.dailyChatCap}) must appear: "${gap.consequence}"`,
  );
});

check("the trading-account gap says a demo is enough", () => {
  // Someone who has not funded an account still has to be able to see the app
  // work, or the first run is a dead end for anyone still deciding.
  const gap = describeSetupGaps(fresh).find((g) => g.id === "trading-account");
  assert.ok(/demo/i.test(gap.consequence), `"${gap.consequence}" should mention a demo account`);
});

check("every gap points somewhere real, with a button that says what it does", () => {
  for (const gap of describeSetupGaps(fresh)) {
    assert.ok(gap.href.startsWith("/"), `href must be in-app: ${gap.href}`);
    assert.ok(
      !/^(learn more|more|view|see details|continue)$/i.test(gap.cta),
      `"${gap.cta}" is a shrug, not an instruction`,
    );
  }
});

console.log("\nthe step itself");

check("onboarding ends on the setup step, not straight at the chart", () => {
  const client = read("src/components/onboarding/SmartOnboardingClient.tsx");
  assert.ok(/"connect"/.test(client), "the step has to exist");
  assert.ok(
    /onNext=\{\(\) => setStep\("connect"\)\}/.test(client),
    "the risk step must hand over to it rather than finishing",
  );
  assert.ok(client.includes("describeSetupGaps("), "and it must ask the shared function");
});

check("it never tells someone with nothing connected that they are set up", () => {
  // The real bug: `setup` is null while the fetch is in flight, and an
  // `gaps.length === 0` branch would then congratulate everyone for a moment.
  const client = read("src/components/onboarding/SmartOnboardingClient.tsx");
  const idx = client.indexOf('{step === "connect" ?');
  assert.ok(idx > 0, "the connect step must be findable");
  const body = client.slice(idx, idx + 2500);
  const unknownAt = body.indexOf("setup === null");
  const emptyAt = body.indexOf("gaps.length === 0");
  assert.ok(unknownAt > 0, "an unknown state must be handled explicitly");
  assert.ok(
    unknownAt < emptyAt,
    "the unknown branch has to come first, or a pending fetch reads as success",
  );
});

check("the step does not block: the trader can always continue", () => {
  const client = read("src/components/onboarding/SmartOnboardingClient.tsx");
  const idx = client.indexOf('{step === "connect" ?');
  const body = client.slice(idx, idx + 2500);
  assert.ok(/nextDisabled=\{saving\}/.test(body), "only a save in flight may disable Next");
  assert.ok(
    !/nextDisabled=\{gaps\.length/.test(body),
    "an unconnected trader must still be able to enter the app",
  );
  assert.ok(/optional/i.test(body), "and the screen should say so out loud");
});

check("the API hands over the facts the step needs", () => {
  const route = read("src/app/api/onboarding/route.ts");
  assert.ok(/setup:\s*\{/.test(route), "the GET must carry a setup block");
  assert.ok(/tradingAccounts/.test(route) && /isPaid/.test(route), "with both facts in it");
  assert.ok(
    /head:\s*true/.test(route),
    "count without rows — the client only needs to know whether there are any",
  );
  assert.ok(
    /catch\(\(\) => null\)/.test(route),
    "billing must fail soft: onboarding cannot break because a lookup is slow",
  );
});

console.log(`\n${passed} checks passed`);
