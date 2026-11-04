import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log("verify-pricing-promises");

check("founder price helper exists", () => {
  assert.ok(existsSync("src/lib/billing/founderPrice.ts"));
  const src = read("src/lib/billing/founderPrice.ts");
  assert.match(src, /isEligibleForFounderPrice/);
});

check("webhook remaps returning Founders", () => {
  const src = read("src/app/api/stripe/webhook/route.ts");
  assert.match(src, /returning Founder blocked from founder price/);
  assert.match(src, /existing\?\.plan === "founder"/);
  assert.ok(!/founder_badge === true && plan === "founder"/.test(src));
});

check("upgrade page withholds founder link for returners", () => {
  const src = read("src/app/(app)/upgrade/page.tsx");
  assert.match(src, /isEligibleForFounderPrice/);
  assert.match(src, /FOUNDER_RETURN_PRICE_NOTICE/);
});

check("support + feedback + roadmap + admin routes exist", () => {
  for (const p of [
    "src/app/api/support/route.ts",
    "src/app/api/feedback/route.ts",
    "src/app/api/roadmap/route.ts",
    "src/app/api/roadmap/vote/route.ts",
    "src/app/api/admin/inbox/route.ts",
    "src/app/(app)/support/page.tsx",
    "src/app/(app)/feedback/page.tsx",
    "src/app/(app)/roadmap/page.tsx",
    "src/app/(app)/admin/inbox/page.tsx",
  ]) {
    assert.ok(existsSync(p), p);
  }
});

check("migration seeds roadmap + tables", () => {
  const mig = read(
    "supabase/migrations/20261029210000_pricing_promises_support_feedback_roadmap.sql",
  );
  assert.match(mig, /axe_support_tickets/);
  assert.match(mig, /axe_product_feedback/);
  assert.match(mig, /axe_roadmap_items/);
  assert.match(mig, /axe_roadmap_votes/);
  assert.match(mig, /advanced-ai-models/);
});

check("discord invite config + invite komt copy", () => {
  assert.ok(existsSync("src/lib/founder/discord.ts"));
  const ui = read("src/components/founder/FounderDiscordCard.tsx");
  assert.match(ui, /invite komt/i);
});

check("beta flags mark push_alerts", () => {
  const flags = read("src/lib/beta/flags.ts");
  assert.match(flags, /push_alerts/);
  const sub = read("src/app/api/push/subscribe/route.ts");
  assert.match(sub, /canAccessBeta\("push_alerts"/);
});

console.log("ok");
