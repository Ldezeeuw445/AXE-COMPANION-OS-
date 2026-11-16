/**
 * Every feature on the pricing page must say where it is enforced, and that
 * place must still mention it. Also: signals stay Free, and an anonymous user
 * can never reach a paid plan.
 *
 * Run: tsx scripts/verify-feature-enforcement.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_ENFORCEMENT } from "../src/lib/billing/featureEnforcement.ts";
import { PAID_ROUTE_FEATURES, FREE_ROUTE_REASONS } from "../src/lib/billing/routeFeatures.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}
const src = readFileSync("src/lib/billing/features.ts", "utf8");
const features = [...src.matchAll(/^\s+\| "([a-z_]+)"/gm)].map((m) => m[1]);

console.log("feature enforcement");

check("the feature list was read", () => assert.ok(features.length >= 15, features.join(",")));

check("every advertised feature has an enforcement entry (and no stale ones)", () => {
  assert.deepEqual(Object.keys(FEATURE_ENFORCEMENT).sort(), [...features].sort());
});

check("every 'server' entry points at files that exist and still mention the feature", () => {
  for (const [feature, e] of Object.entries(FEATURE_ENFORCEMENT)) {
    if (e.status !== "server") continue;
    assert.ok(e.files.length > 0, `${feature}: no files`);
    for (const f of e.files) {
      assert.ok(existsSync(f), `${feature}: ${f} does not exist`);
      const text = readFileSync(f, "utf8");
      const needle = e.marker ?? `"${feature}"`;
      assert.ok(text.includes(needle), `${feature}: ${f} no longer mentions ${needle}`);
    }
  }
});

check("'shared' entries lean on a feature that is itself server-enforced", () => {
  for (const [feature, e] of Object.entries(FEATURE_ENFORCEMENT)) {
    if (e.status !== "shared") continue;
    assert.equal(FEATURE_ENFORCEMENT[e.via].status, "server", `${feature} -> ${e.via}`);
    assert.ok(e.note.length >= 20, `${feature}: explain the sharing`);
  }
});

check("'client-only' entries are rare and explained", () => {
  const clientOnly = Object.entries(FEATURE_ENFORCEMENT).filter(([, e]) => e.status === "client-only");
  assert.ok(clientOnly.length <= 1, `new client-only gate(s): ${clientOnly.map(([f]) => f).join(", ")}`);
  for (const [f, e] of clientOnly) assert.ok(e.note.length >= 40, `${f}: explain why`);
});

check("signals are Free: no signals route is ever listed as paid", () => {
  const paidSignals = Object.keys(PAID_ROUTE_FEATURES).filter((r) => r === "signals" || r.startsWith("signals/"));
  assert.deepEqual(paidSignals, [], "Luka decided signals are free for everyone");
  // If a /api/signals route exists it must be classified as free, with a reason.
  const exists = existsSync("src/app/api/signals/route.ts");
  if (exists) assert.ok("signals" in FREE_ROUTE_REASONS, "api/signals exists but is not classified as free");
});

check("background jobs filter users through the entitlement, not the raw plan string", () => {
  const jobs = {
    "src/services/axeProactiveWatcher.ts": "proactive_notifications",
    "src/services/cockpitSnapshotBatchService.ts": "cockpit_learning",
    "src/services/axeDailyBriefingService.ts": "briefings",
  };
  for (const [file, feature] of Object.entries(jobs)) {
    const text = readFileSync(file, "utf8");
    assert.match(text, new RegExp(`filterUsersWithFeature\\([^)]*"${feature}"`), `${file} must call filterUsersWithFeature(..., "${feature}")`);
  }
});

check("anonymous users are held to Free on every entitlement read and grant", () => {
  const billing = readFileSync("src/services/billingService.ts", "utf8");
  assert.match(billing, /applyAnonymousRule\(/, "getUserAxeEntitlement must apply the anonymous rule");
  const hook = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
  assert.match(hook, /isAnonymousAuthUser\(input\.userId\)/, "the Stripe webhook must refuse paid grants to anonymous users");
});

check("nothing in the app writes a paid entitlement except the Stripe webhook", () => {
  const writers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
        const t = readFileSync(full, "utf8");
        if (/from\(\s*["']axe_user_entitlements["']\s*\)[\s\S]{0,200}\.(upsert|insert|update)\(/.test(t)) writers.push(full);
      }
    }
  };
  walk("src");
  assert.ok(writers.every((w) => w === "src/app/api/stripe/webhook/route.ts"), `unexpected entitlement writers: ${writers.join(", ")}`);
});

console.log(`\n${passed} checks passed`);
