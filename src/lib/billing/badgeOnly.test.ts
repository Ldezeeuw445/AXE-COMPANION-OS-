import { test } from "node:test";
import assert from "node:assert/strict";
import { entitlementFromRow } from "./entitlementCore";
import { featurePlanForEntitlement, hasEntitlementFeature, hasFullCompanionAccess } from "./access";
import { enforcedDailyChatLimit } from "./chatLimits";
import type { AxeFeature } from "./features";
import { FEATURE_ENFORCEMENT } from "./featureEnforcement";

const ALL = Object.keys(FEATURE_ENFORCEMENT) as AxeFeature[];
const none = (ent: ReturnType<typeof entitlementFromRow>, id = "u1") =>
  ALL.filter((f) => hasEntitlementFeature(ent, f, id));

test("a cancelled Founder (plan free + founder_badge) keeps the badge and no Pro feature", () => {
  const ent = entitlementFromRow({ plan: "free", founder_badge: true });
  assert.equal(ent.founderBadge, true);
  assert.equal(ent.isPaid, false);
  assert.equal(ent.label, "Free");
  assert.deepEqual(none(ent), []);
  assert.equal(hasFullCompanionAccess(ent), false);
  assert.equal(featurePlanForEntitlement(ent), "free");
});

test("chat_quota_exempt alone lifts the chat cap and unlocks no Pro feature", () => {
  const ent = entitlementFromRow({ plan: "free", chat_quota_exempt: true });
  assert.equal(ent.chatQuotaExempt, true);
  assert.equal(enforcedDailyChatLimit(ent.plan, ent.chatQuotaExempt), -1);
  assert.deepEqual(none(ent), []);
  assert.equal(ent.isPaid, false);
});

test("badge + exempt on a free plan (the old demo shape without the plan) unlocks nothing", () => {
  const ent = entitlementFromRow({ plan: "free", founder_badge: true, chat_quota_exempt: true });
  assert.deepEqual(none(ent), []);
});

test("plan=founder keeps every feature whether or not it also has a badge or exemption", () => {
  for (const row of [
    { plan: "founder" },
    { plan: "founder", founder_badge: true },
    { plan: "founder", founder_badge: true, chat_quota_exempt: true },
    { plan: "founder", chat_quota_exempt: true }, // the owner row without a badge
  ]) {
    const ent = entitlementFromRow(row);
    assert.equal(ent.label, "Founder", JSON.stringify(row));
    assert.equal(none(ent).length, ALL.length, JSON.stringify(row));
    assert.equal(featurePlanForEntitlement(ent), "founder");
  }
});

test("pro, elite and an active pro_until trial still unlock; an expired trial does not", () => {
  assert.equal(none(entitlementFromRow({ plan: "pro" })).length, ALL.length);
  assert.equal(none(entitlementFromRow({ plan: "elite" })).length, ALL.length);
  const trial = entitlementFromRow({ plan: "free", pro_until: "2999-01-01T00:00:00Z" });
  assert.equal(featurePlanForEntitlement(trial), "pro");
  assert.equal(none(trial).length, ALL.length);
  const expired = entitlementFromRow({ plan: "free", pro_until: "2000-01-01T00:00:00Z", founder_badge: true });
  assert.deepEqual(none(expired), []);
});

test("the owner allow-list (explicit env switch) still grants everything", () => {
  process.env.AXE_FULL_ACCESS_USER_IDS = "owner-1";
  try {
    const ent = entitlementFromRow({ plan: "free" });
    assert.equal(none(ent, "owner-1").length, ALL.length);
    assert.deepEqual(none(ent, "someone-else"), []);
  } finally {
    delete process.env.AXE_FULL_ACCESS_USER_IDS;
  }
});
