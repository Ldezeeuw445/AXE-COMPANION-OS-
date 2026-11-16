import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAnonymousRule,
  clampAnonymousEntitlement,
  createAnonymityResolver,
  entitlementFromRow,
  isPaidShaped,
} from "./entitlementCore";
import { hasEntitlementFeature } from "./access";
import type { AxeFeature } from "./features";
import { FEATURE_ENFORCEMENT } from "./featureEnforcement";

const ALL_FEATURES = Object.keys(FEATURE_ENFORCEMENT) as AxeFeature[];

// The exact shape the old /api/auth/demo wrote for 51 anonymous users.
const demoFounderRow = { plan: "founder", founder_badge: true, chat_quota_exempt: true };
const stripeProRow = {
  plan: "pro",
  founder_badge: false,
  chat_quota_exempt: false,
  stripe_customer_id: "cus_x",
  stripe_subscription_id: "sub_x",
  pro_until: "2999-01-01T00:00:00Z",
};

test("fixture sanity: without the anonymous rule, the demo row unlocks every feature", () => {
  const ent = entitlementFromRow(demoFounderRow);
  assert.equal(ent.plan, "founder");
  for (const f of ALL_FEATURES) assert.equal(hasEntitlementFeature(ent, f), true, f);
});

test("an anonymous user with a founder row is held to Free: no paid feature, no badge, no exemption", () => {
  const ent = applyAnonymousRule(entitlementFromRow(demoFounderRow), true);
  assert.equal(ent.plan, "free");
  assert.equal(ent.isPaid, false);
  assert.equal(ent.founderBadge, false);
  assert.equal(ent.chatQuotaExempt, false);
  assert.equal(ent.label, "Free");
  for (const f of ALL_FEATURES) assert.equal(hasEntitlementFeature(ent, f), false, `${f} must stay locked`);
});

test("anonymous with an elite/pro row or a future pro_until trial is clamped too", () => {
  for (const row of [
    { plan: "elite" },
    { plan: "pro" },
    { plan: "free", pro_until: "2999-01-01T00:00:00Z" },
    { plan: "free", chat_quota_exempt: true },
    { plan: "free", founder_badge: true },
  ]) {
    const ent = applyAnonymousRule(entitlementFromRow(row), true);
    assert.equal(isPaidShaped(ent), false, JSON.stringify(row));
    assert.equal(hasEntitlementFeature(ent, "unlimited_chat"), false);
  }
});

test("a real (non-anonymous) paid user keeps their plan", () => {
  const ent = applyAnonymousRule(entitlementFromRow(stripeProRow), false);
  assert.equal(ent.plan, "pro");
  assert.equal(hasEntitlementFeature(ent, "cockpit_learning"), true);
});

test("lookup failed (unknown): a paid row with no Stripe subscription fails closed", () => {
  const ent = applyAnonymousRule(entitlementFromRow(demoFounderRow), null);
  assert.equal(ent.plan, "free");
  assert.equal(hasEntitlementFeature(ent, "briefings"), false);
});

test("lookup failed (unknown): a row backed by a Stripe subscription is NOT downgraded", () => {
  const ent = applyAnonymousRule(entitlementFromRow(stripeProRow), null);
  assert.equal(ent.plan, "pro");
});

test("a free user is untouched and costs no lookup decision", () => {
  const ent = entitlementFromRow({ plan: "free" });
  assert.equal(isPaidShaped(ent), false);
  assert.equal(applyAnonymousRule(ent, true), ent);
});

test("entitlementFromRow keeps the existing labels and trial semantics", () => {
  assert.equal(entitlementFromRow(null).label, "Free");
  assert.equal(entitlementFromRow({ plan: "pro" }).label, "Pro");
  assert.equal(entitlementFromRow({ plan: "elite" }).label, "Elite");
  assert.equal(entitlementFromRow({ plan: "founder" }).label, "Founder");
  const trial = entitlementFromRow({ plan: "free", pro_until: "2999-01-01T00:00:00Z" });
  assert.equal(trial.plan, "pro");
  assert.equal(trial.isPaid, true);
  const expired = entitlementFromRow({ plan: "free", pro_until: "2000-01-01T00:00:00Z" });
  assert.equal(expired.isPaid, false);
});

test("clampAnonymousEntitlement keeps ids, drops everything that pays", () => {
  const raw = entitlementFromRow(stripeProRow);
  const c = clampAnonymousEntitlement(raw);
  assert.equal(c.stripeCustomerId, "cus_x");
  assert.equal(c.proUntil, null);
  assert.equal(c.isPaid, false);
});

test("anonymity resolver caches definitive answers and retries errors", async () => {
  let calls = 0;
  let answer: boolean | null = null;
  let t = 0;
  const resolve = createAnonymityResolver(
    async () => {
      calls += 1;
      return answer;
    },
    { ttlMs: 1000, now: () => t },
  );
  assert.equal(await resolve("u1"), null);
  assert.equal(await resolve("u1"), null);
  assert.equal(calls, 2, "errors are not cached");
  answer = true;
  assert.equal(await resolve("u1"), true);
  assert.equal(await resolve("u1"), true);
  assert.equal(calls, 3, "definitive answer is cached");
  t = 5000;
  answer = false;
  assert.equal(await resolve("u1"), false, "cache expires");
  assert.equal(calls, 4);
});
