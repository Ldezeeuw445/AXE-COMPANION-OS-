/**
 * Every authenticated API route must have a decided tier.
 *
 * On 2026-10-11, two of eighty-four routes checked a plan. The tiers existed
 * as a price list and not as a boundary: anyone on the free plan could call a
 * Pro route with a fetch, because the only thing stopping them was a hidden
 * button. This script makes that state impossible to return to.
 *
 * It fails when a route is in neither map — so a NEW route cannot default to
 * free by accident. Someone has to decide, and write down why.
 *
 * Run: node scripts/verify-tier-gates.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PAID_ROUTE_FEATURES,
  FREE_ROUTE_REASONS,
  isUngatedPrefix,
} from "../src/lib/billing/routeFeatures.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Every route.ts under src/app/api, as its path below /api. */
function findRoutes(dir, base = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findRoutes(full, base ? `${base}/${entry}` : entry));
    } else if (entry === "route.ts") {
      out.push(base);
    }
  }
  return out;
}

const routes = findRoutes("src/app/api");
const AUTH_MARKERS = /auth\.getUser\(\)|getAuthedServiceSupabase/;

console.log("tier gates");

check("every route is classified: paid, free-with-a-reason, or not user-facing", () => {
  const unclassified = [];
  for (const route of routes) {
    if (isUngatedPrefix(route)) continue;
    if (route in PAID_ROUTE_FEATURES) continue;
    if (route in FREE_ROUTE_REASONS) continue;
    unclassified.push(route);
  }
  assert.deepEqual(
    unclassified,
    [],
    `these routes have no decided tier — add them to PAID_ROUTE_FEATURES or FREE_ROUTE_REASONS:\n  ${unclassified.join("\n  ")}`,
  );
});

check("no route is in both maps", () => {
  const both = Object.keys(PAID_ROUTE_FEATURES).filter((r) => r in FREE_ROUTE_REASONS);
  assert.deepEqual(both, [], `contradictory classification: ${both.join(", ")}`);
});

check("every free route states a real reason", () => {
  for (const [route, reason] of Object.entries(FREE_ROUTE_REASONS)) {
    assert.ok(
      typeof reason === "string" && reason.trim().length >= 12,
      `${route}: "free" needs a reason someone can read back in a year`,
    );
  }
});

check("a free route that leans on an owner gate actually has one", () => {
  // Sommige routes staan niet als "free" in de lijst omdat ze voor iedereen
  // zijn, maar omdat ze achter een poort zitten die niets met een abonnement
  // te maken heeft — de eigenaar, of een admin-lijst. Die reden is dan het
  // enige dat de route beschermt.
  //
  // Verdwijnt die poort ooit uit de code, dan blijft de regel in deze lijst
  // keurig staan en leest de volgende lezer dat het bewust gratis is. Niets
  // wordt rood. Daarom wordt de belofte hier nagemeten in plaats van geloofd.
  const ongated = [];
  for (const [route, reason] of Object.entries(FREE_ROUTE_REASONS)) {
    if (!/owner-only|admin-only/i.test(reason)) continue;
    const src = readFileSync(`src/app/api/${route}/route.ts`, "utf8");
    const resolvesUser = AUTH_MARKERS.test(src);
    const refuses = /\b403\b/.test(src);
    if (!resolvesUser || !refuses) {
      ongated.push(`${route} (${!resolvesUser ? "resolves no user" : "never answers 403"})`);
    }
  }
  assert.deepEqual(
    ongated,
    [],
    `free because of an owner/admin gate, but the gate is not in the route:\n  ${ongated.join("\n  ")}`,
  );
});

check("both maps only name routes that exist", () => {
  const known = new Set(routes);
  const ghosts = [...Object.keys(PAID_ROUTE_FEATURES), ...Object.keys(FREE_ROUTE_REASONS)].filter(
    (r) => !known.has(r),
  );
  assert.deepEqual(ghosts, [], `these map entries point at no route: ${ghosts.join(", ")}`);
});

check("every paid route actually calls the gate, with its own feature", () => {
  const missing = [];
  const wrongFeature = [];
  for (const [route, feature] of Object.entries(PAID_ROUTE_FEATURES)) {
    const src = readFileSync(`src/app/api/${route}/route.ts`, "utf8");
    if (!/requireEntitlementFeature\(|hasEntitlementFeature\(/.test(src)) {
      missing.push(route);
      continue;
    }
    if (!src.includes(`"${feature}"`)) wrongFeature.push(`${route} (expected ${feature})`);
  }
  assert.deepEqual(missing, [], `mapped as paid but ungated:\n  ${missing.join("\n  ")}`);
  assert.deepEqual(wrongFeature, [], `gated with the wrong feature:\n  ${wrongFeature.join("\n  ")}`);
});

check("a paid route cannot gate without knowing who is asking", () => {
  const noAuth = [];
  for (const route of Object.keys(PAID_ROUTE_FEATURES)) {
    const src = readFileSync(`src/app/api/${route}/route.ts`, "utf8");
    if (!AUTH_MARKERS.test(src)) noAuth.push(route);
  }
  assert.deepEqual(noAuth, [], `gated but never resolves a user: ${noAuth.join(", ")}`);
});

check("the gate returns 403 and says what plan is needed", () => {
  const src = readFileSync("src/lib/billing/requireFeature.ts", "utf8");
  assert.ok(/status: 403/.test(src), "a missing plan is 403, not 401 and not 500");
  assert.ok(/requiredPlanLabelForFeature/.test(src), "the error must name the plan to buy");
});

console.log(`\n${passed} checks passed`);
