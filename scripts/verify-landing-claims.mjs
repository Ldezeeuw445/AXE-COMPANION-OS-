/**
 * The landing page is a promise. These checks keep it one we keep.
 *
 * Three claims on `/` had gone stale while the app moved underneath them:
 *
 *   - "Unusual Whales" sat in the hero trust row and in a feature tile, for a
 *     subscription that was never bought. Naming a provider you do not have is
 *     the one marketing lie a trader will check.
 *   - Pricing showed two cards, "Free" and "~€19/mo", while the product sold
 *     four tiers at €0 / €20 / €40 / €50 with live Stripe keys. The page is now
 *     generated from AXE_BILLING_TIERS, and this file proves it cannot drift.
 *   - The FAQ said execution was behind a master password and stopped there,
 *     with nothing about the limits that actually gate an automatic order.
 *
 * It also holds the landing-page decision in place: `/` is the landing page,
 * the retired drafts redirect to it, and the switcher to Trading OS exists.
 *
 * Run: node scripts/verify-landing-claims.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { AXE_BILLING_TIERS, FOUNDER_SEAT_CAP } from "../src/lib/billing/tiers.ts";
import {
  ECOSYSTEM_APPS,
  PUBLIC_ECOSYSTEM_APPS,
  availabilityLabel,
  ecosystemApp,
  isReachable,
} from "../src/lib/ecosystem/apps.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const landing = read("src/app/page.tsx");
const switcher = read("src/components/marketing/AppSwitcher.tsx");
const robots = read("src/app/robots.ts");
const sitemap = read("src/app/sitemap.ts");

console.log("landing claims");

// ── no provider we do not pay for ────────────────────────────────────────
check("Unusual Whales is only ever disclosed, never advertised", () => {
  // Naming it as a thing we do not have is honest. Naming it in a trust row
  // or a feature tile is the one marketing lie a trader will check.
  const mentions = [...landing.matchAll(/unusual\s*whales/gi)];
  assert.equal(
    mentions.length,
    1,
    `Unusual Whales appears ${mentions.length}x; only the FAQ disclosure may mention it`,
  );
  const context = landing.slice(mentions[0].index, mentions[0].index + 160);
  assert.ok(
    /have not bought|not configured/i.test(context),
    "the single mention must say we do not have it",
  );
});

check("it does name the free intel sources that do work", () => {
  for (const source of ["SEC EDGAR", "GDELT"]) {
    assert.ok(landing.includes(source), `${source} should be named instead`);
  }
});

// ── pricing comes from the source of truth ───────────────────────────────
check("pricing is generated from AXE_BILLING_TIERS, not retyped", () => {
  assert.ok(
    landing.includes("AXE_BILLING_TIERS.map("),
    "the pricing grid must map the tier list",
  );
  assert.ok(
    landing.includes("tier.priceEurMonthly"),
    "prices must be read from the tier, never written into the markup",
  );
});

check("no stale price is hardcoded anywhere on the page", () => {
  const prices = new Set(
    AXE_BILLING_TIERS.map((t) => t.priceEurMonthly).filter((p) => p !== null && p !== 0),
  );
  // Any "€<number>" literal in the page must be a price we actually charge.
  for (const [, amount] of landing.matchAll(/€(\d+)/g)) {
    const n = Number(amount);
    const known = prices.has(n) || n === 0 || n === 69 || n === 79; // 69/79 = Trading OS SKUs
    assert.ok(known, `€${n} appears on the landing page but is not a price we charge`);
  }
  assert.ok(!/~€19|€19\/mo/.test(landing), "the old ~€19/mo guess must be gone");
});

check("every tier has landing bullets, and no orphan bullets exist", () => {
  const ids = AXE_BILLING_TIERS.map((t) => t.id);
  for (const id of ids) {
    assert.ok(
      new RegExp(`^\\s{2}${id}: \\[`, "m").test(landing),
      `tier "${id}" has no bullets in LANDING_TIER_BULLETS`,
    );
  }
  const declared = [...landing.matchAll(/^ {2}(\w+): \[$/gm)]
    .map((m) => m[1])
    .filter((k) => ids.includes(k) || ["free", "pro", "founder", "elite"].includes(k));
  for (const key of declared) {
    assert.ok(ids.includes(key), `bullets declared for unknown tier "${key}"`);
  }
});

check("the founder seat cap is read, not retyped", () => {
  assert.ok(landing.includes("{FOUNDER_SEAT_CAP}"), "print the cap from the constant");
  assert.equal(FOUNDER_SEAT_CAP, 100);
  assert.ok(
    !/\b100 seats\b/.test(landing),
    "a hardcoded seat count would survive a change to the cap",
  );
});

// ── the execution story is told whole ────────────────────────────────────
check("the FAQ answers whether AXE can trade on its own", () => {
  assert.ok(
    /without me pressing anything|zonder dat ik/i.test(landing),
    "the question a trader actually asks must be on the page",
  );
});

check("the guard rails are named, all five of them", () => {
  for (const rule of [/news window/i, /weekend/i, /lot (is )?above/i, /daily loss/i, /maximum of automatic trades|day's maximum/i]) {
    assert.ok(rule.test(landing), `guard not mentioned: ${rule}`);
  }
});

check("the page promises a block, never a quiet downsize", () => {
  assert.ok(
    /not quietly place a smaller trade|never quietly shrink/i.test(landing),
    "autoTradeGuard blocks and explains; the page must say so",
  );
});

// ── one landing page, and a way across to Trading OS ─────────────────────
check("the retired drafts redirect to / instead of competing with it", () => {
  for (const route of ["launch", "final", "finallaunch", "ui-premium"]) {
    const file = `src/app/${route}/page.tsx`;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing`);
    const src = read(file);
    assert.ok(
      src.includes('permanentRedirect("/")'),
      `${route} must 308 to the one landing page`,
    );
  }
});

check("no retired draft is advertised in the sitemap", () => {
  for (const route of ["/launch", "/final", "/finallaunch", "/ui-premium"]) {
    assert.ok(!sitemap.includes(`"${route}"`), `${route} redirects; drop it from the sitemap`);
  }
  assert.ok(sitemap.includes('{ path: "", priority: 1.0'), "/ must still be the top entry");
});

check("robots keeps crawlers off the redirects", () => {
  for (const route of ["/launch", "/final", "/finallaunch", "/ui-premium"]) {
    assert.ok(robots.includes(`"${route}"`), `${route} should be disallowed`);
  }
});

check("the landing header carries the app switcher", () => {
  assert.ok(
    landing.includes('<AppSwitcher current="companion" />'),
    "the switcher is the cross-app move Luka asked for; it belongs in the header",
  );
  assert.ok(
    landing.indexOf("<AppSwitcher") < landing.indexOf("live ticker"),
    "it must sit in the header, above the fold",
  );
});

check("the page links out to Trading OS by URL, not by prose", () => {
  const tos = ecosystemApp("trading-os");
  assert.ok(tos, "trading-os must exist in the ecosystem list");
  assert.ok(
    landing.includes('ecosystemApp("trading-os")'),
    "read the URL from the ecosystem list so one edit moves both links",
  );
  assert.ok(tos.url.startsWith("https://"), "the URL must be absolute");
});

// ── AXE Core must never leak into a public switcher ──────────────────────
check("AXE Core is in the ecosystem but never public", () => {
  const core = ecosystemApp("axe-core");
  assert.ok(core, "axe-core should still be listed for internal use");
  assert.equal(core.availability, "private");
  assert.ok(
    !PUBLIC_ECOSYSTEM_APPS.some((a) => a.id === "axe-core"),
    "a visitor must never see the operator cockpit in a switcher",
  );
  assert.ok(
    switcher.includes("PUBLIC_ECOSYSTEM_APPS.map("),
    "the switcher must render the public list",
  );
  assert.ok(
    !/(?<!PUBLIC_)ECOSYSTEM_APPS/.test(switcher),
    "the switcher must not touch the unfiltered list, which holds AXE Core",
  );
  assert.ok(
    !landing.includes("axeheadquarters"),
    "the public landing page must not mention AXE Core at all",
  );
});

check("the public switcher offers exactly Companion and Trading OS", () => {
  assert.deepEqual(
    PUBLIC_ECOSYSTEM_APPS.map((a) => a.id),
    ["companion", "trading-os"],
  );
});

check("a surface that is not open yet says so", () => {
  assert.equal(availabilityLabel("beta"), "Private beta");
  assert.equal(availabilityLabel("offline"), "Moving hosts");
  assert.equal(availabilityLabel("live"), null, "live needs no badge");
  assert.equal(ecosystemApp("companion").availability, "live");
  assert.ok(isReachable("live") && isReachable("beta"));
  assert.ok(!isReachable("offline") && !isReachable("private"));
});

check("nothing links out to a surface that is down", () => {
  // tradingosapp.com answers 402 (DEPLOYMENT_DISABLED) on both the apex and
  // www while it moves off Vercel. A switcher that hands a visitor that page
  // is worse than one that says the terminal is between hosts.
  assert.ok(
    switcher.includes("if (!isReachable(app.availability))"),
    "the switcher must render an unreachable surface as text, not a link",
  );
  assert.ok(
    switcher.includes('aria-disabled="true"'),
    "an unreachable row must be announced as unavailable",
  );
  assert.ok(
    /tradingOs && isReachable\(tradingOs\.availability\)/.test(landing),
    "the page's own Trading OS button must be gated the same way",
  );
  assert.ok(
    !/>\s*Private beta\s*</.test(landing),
    "the Trading OS badge must come from availabilityLabel, not be retyped — " +
      "a hardcoded one left the page saying 'Private beta' while the switcher " +
      "said 'Moving hosts'",
  );
  // And the gate has to actually bite for the one surface that is down today.
  assert.ok(
    !isReachable(ecosystemApp("trading-os").availability),
    "Trading OS is 402 right now; flip it back to beta when the new host answers 200",
  );
});

check("every ecosystem entry is complete", () => {
  for (const app of ECOSYSTEM_APPS) {
    assert.ok(app.name && app.tagline, `${app.id} needs a name and a tagline`);
    assert.ok(/^https:\/\/\S+$/.test(app.url), `${app.id} needs an absolute https URL`);
    assert.ok(["phone", "desktop"].includes(app.form), `${app.id} has no form factor`);
  }
  const urls = ECOSYSTEM_APPS.map((a) => a.url);
  assert.equal(new Set(urls).size, urls.length, "two surfaces share a URL");
});

// ── the switcher behaves ─────────────────────────────────────────────────
check("the switcher closes on Escape and on an outside click", () => {
  assert.ok(switcher.includes('event.key === "Escape"'), "Escape must close it");
  assert.ok(switcher.includes("pointerdown"), "a click outside must close it");
  assert.ok(switcher.includes("removeEventListener"), "listeners must be torn down");
});

check("the menu fits a phone screen", () => {
  // A left-anchored fixed-width panel hanging off a mid-header trigger gets
  // clipped at 390px wide, and the page hides horizontal overflow, so the
  // clipped half is unreachable. Below sm it must span the viewport.
  assert.ok(
    /fixed left-3 right-3/.test(switcher),
    "the panel must span the viewport with a gutter on phones",
  );
  assert.ok(
    /sm:absolute sm:left-0/.test(switcher),
    "from sm up it should hang off the trigger like a normal menu",
  );
});

check("the current surface is marked, not linked", () => {
  assert.ok(switcher.includes('aria-current="true"'), "mark where the visitor already is");
  assert.ok(switcher.includes("if (isCurrent)"), "the current app must not be a link to itself");
});

check("it is reachable by keyboard and announced", () => {
  assert.ok(switcher.includes('aria-haspopup="menu"'));
  assert.ok(switcher.includes("aria-expanded={open}"));
  assert.ok(switcher.includes('role="menu"'));
  assert.ok(/aria-label=\{`\$\{activeName\}/.test(switcher), "the trigger needs a label");
  // not-sr-only is not emitted by this Tailwind build, so the visible label
  // must use a utility that is. A silent miss here means a bare chevron.
  assert.ok(
    !/not-sr-only/.test(switcher),
    "not-sr-only produces no CSS in this build; use hidden/sm:inline",
  );
  assert.ok(
    /hidden whitespace-nowrap sm:inline">Switch app</.test(switcher),
    "the trigger needs a visible label from sm up",
  );
});

console.log(`\n${passed} checks passed`);
