/**
 * Pricing page promises that must be enforced in code (Luka 2026-10-29).
 * Run: node scripts/verify-pricing-enforcement.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  AXE_BILLING_TIERS,
  liveAccountsCapForPlan,
  fairUseSoftCapForPlan,
} from "../src/lib/billing/tiers.ts";
import { enforcedDailyChatLimit } from "../src/lib/billing/chatLimits.ts";
import { canConnectLiveAccount } from "../src/lib/billing/liveAccounts.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}
const read = (p) => readFileSync(p, "utf8");

console.log("pricing enforcement");

check("tier caps match signed pricing (live + chat soft ceilings)", () => {
  assert.equal(liveAccountsCapForPlan("free"), 1);
  assert.equal(liveAccountsCapForPlan("pro"), 3);
  assert.equal(liveAccountsCapForPlan("founder"), 5);
  assert.equal(liveAccountsCapForPlan("elite"), 10);
  assert.equal(enforcedDailyChatLimit("free"), 20);
  assert.equal(enforcedDailyChatLimit("pro"), 200);
  assert.equal(enforcedDailyChatLimit("founder"), 500);
  assert.equal(enforcedDailyChatLimit("elite"), 500);
  assert.equal(fairUseSoftCapForPlan("pro"), 200);
  assert.equal(fairUseSoftCapForPlan("founder"), 500);
});

check("migration enforces entitlements-based chat caps (not profiles.plan)", () => {
  const mig = "supabase/migrations/20261029170000_enforce_plan_chat_and_live_caps.sql";
  assert.ok(existsSync(mig), "migration file missing");
  const sql = read(mig);
  assert.match(sql, /axe_user_entitlements/);
  assert.match(sql, /RETURN 200/);
  assert.match(sql, /RETURN 500/);
  assert.match(sql, /timezone\('utc'/);
  assert.ok(!/FROM public\.profiles/.test(sql), "must not read profiles.plan");
});

check("MT5 connect action gates new live accounts", () => {
  const src = read("src/app/actions/mt5Cloud.ts");
  assert.match(src, /canConnectLiveAccount/);
  assert.match(src, /Live-account plan cap/);
});

check("connect wizard shows plan live-account notice", () => {
  const wiz = read("src/components/accounts/BrokerConnectWizard.tsx");
  assert.match(wiz, /liveAccountsNotice/);
  assert.match(wiz, /live-accounts-plan-notice/);
});

check("chat APIs return friendly quota notice (not scare error)", () => {
  const messages = read("src/app/api/chat/messages/route.ts");
  assert.match(messages, /quotaNotice|friendly/);
  assert.ok(!/Upgrade to Pro for unlimited chat/.test(messages));
  const stream = read("src/app/api/chat/stream/route.ts");
  assert.match(stream, /quotaNotice|midnight UTC/);
});

check("grandfather: at-cap user can reconnect excluded id", () => {
  const rows = [
    { id: "1", connection_method: "cloud_mt5" },
    { id: "2", connection_method: "cloud_mt5" },
    { id: "3", connection_method: "cloud_mt5" },
    { id: "4", connection_method: "cloud_mt5" },
  ];
  assert.equal(canConnectLiveAccount({ plan: "pro", existingAccounts: rows }).allowed, false);
  assert.equal(
    canConnectLiveAccount({ plan: "pro", existingAccounts: rows, excludeAccountId: "1" }).allowed,
    true,
  );
});

check("AXE_BILLING_TIERS still list MetaApi as included (no surcharge copy)", () => {
  const free = AXE_BILLING_TIERS.find((t) => t.id === "free");
  assert.ok(free?.includes.some((line) => /MetaApi/i.test(line)));
});

console.log(`\n${passed} checks passed`);
