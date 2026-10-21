/**
 * The landing page is a promise. These checks keep it one we keep.
 *
 * The public homepage is the finallaunch / Trading-OS-twin Companion landing:
 * "The trader's phone OS", device plate, hover-reveal cards, second brain,
 * intel feed grid, execution discipline, Companion-only feature grid,
 * Trading OS bridge, billing-backed pricing, FAQ, waitlist, legal.
 * Claims must stay true as the app moves.
 *
 * Run: node scripts/verify-landing-claims.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { AXE_BILLING_TIERS, FOUNDER_SEAT_CAP, TRADING_OS_FOUNDER_TIER } from "../src/lib/billing/tiers.ts";
import { INTEL_ACTION_SOURCE } from "../src/lib/intel/intelSources.ts";
import {
  ECOSYSTEM_APPS,
  PUBLIC_ECOSYSTEM_APPS,
  availabilityLabel,
  ecosystemApp,
  isReachable,
} from "../src/lib/ecosystem/apps.ts";
import {
  COMPANION_FEATURES,
  LANDING_FAQ,
  LANDING_HERO,
  LANDING_INTEL_FEED_COUNT,
  LANDING_INTEL_FEEDS,
  LANDING_INTRO,
  LANDING_REVEAL_CARDS,
  LANDING_SECOND_BRAIN,
  LANDING_SHOWCASE,
  LANDING_TOS_BRIDGE,
  LANDING_TESTIMONIALS,
  landingTestimonialsEnabled,
} from "../src/lib/marketing/landingCopy.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const landingDir = new URL("../src/components/marketing/landing/", import.meta.url);
const landingFiles = readdirSync(landingDir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => read(join("src/components/marketing/landing", name)));
const landing = [
  read("src/app/page.tsx"),
  read("src/lib/marketing/landingCopy.ts"),
  read("src/lib/marketing/loadLandingCatalog.ts"),
  read("src/components/marketing/LandingWaitlist.tsx"),
  read("src/components/marketing/LaunchHeroExperience.tsx"),
  ...landingFiles,
].join("\n");
const switcher = read("src/components/marketing/AppSwitcher.tsx");
const robots = read("src/app/robots.ts");
const hero = read("src/components/marketing/LandingHeroDevices.tsx");
const heroCss = read("src/app/globals.css");
const heroMock = read("public/hero-demo/app.html");
const sitemap = read("src/app/sitemap.ts");
const nextConfig = read("next.config.ts");

console.log("landing claims");

check("the homepage is the finallaunch Companion landing Luka asked for", () => {
  assert.equal(LANDING_HERO.titleLead, "AXE Companion.");
  assert.equal(LANDING_HERO.titleAccent, "The trader's phone OS.");
  assert.match(LANDING_HERO.badge, /AXE Companion OS/i);
  assert.equal(LANDING_SECOND_BRAIN.titleAccent, "Your Second Brain For Trading.");
  assert.equal(LANDING_REVEAL_CARDS[0].title, "Surface the signal.");
  assert.equal(LANDING_REVEAL_CARDS[1].title, "Quiet, but not flat.");
  assert.equal(LANDING_REVEAL_CARDS[2].title, "Premium motion cues.");
  assert.match(landing, /Try the live demo/);
  assert.match(landing, /See pricing/);
  assert.match(landing, /Execution discipline, visible in real time/);
  assert.match(landing, /LaunchHeroExperience/);
  assert.match(landing, /LandingHeroDevices/);
  assert.match(landing, /LandingShowcase/);
  assert.match(landing, /LandingFeatureGrid/);
  assert.match(landing, /LandingPricing/);
  assert.match(landing, /LandingFaq/);
  assert.match(landing, /LandingFinalCta/);
  assert.ok(!/LandingCockpitExample/.test(landing));
  assert.ok(!/LandingDeskChat/.test(landing));
  assert.ok(!/LandingEngine/.test(landing));
  assert.ok(!/LandingSurfaces/.test(landing));
  assert.equal(LANDING_INTRO.loginBody.includes("Supabase"), false);
  assert.equal(LANDING_SHOWCASE.length, 8);
  for (const row of LANDING_SHOWCASE) {
    assert.notEqual(row.href, "#", `${row.step} must not use href='#'`);
  }
  const copy = read("src/lib/marketing/landingCopy.ts");
  assert.ok(!/same Supabase account/i.test(copy), "marketing copy must not mention a Supabase account");
  assert.ok(!/Supabase/i.test(copy), "marketing copy must not name Supabase");
  assert.ok(!/Row-Level Security/i.test(copy), "marketing copy must not use database jargon");
});

check("the intel feed headline uses the real count from this repo", () => {
  const providerIds = [
    "insiderTrades",
    "senateTrades",
    "darkPoolPrints",
    "unusualOptions",
    "marketTide",
    "corporateJets",
    "vesselTracking",
    "chokepoints",
    "conflictEvents",
    "energyFlows",
    "cyberThreats",
    "militaryRadar",
    "emergencyMonitor",
  ];
  const intelClient = read("src/lib/intel/intelClient.ts");
  for (const id of providerIds) {
    assert.ok(intelClient.includes(`"${id}"`), `intelClient must still expose ${id}`);
  }
  assert.equal(providerIds.length, 13);
  // 13 intelClient providers + Macro, Calendar, News, Correlation, Conviction, Déjà Vu
  assert.equal(LANDING_INTEL_FEED_COUNT, 13 + 6);
  assert.equal(LANDING_INTEL_FEEDS.length, LANDING_INTEL_FEED_COUNT);
  assert.match(landing, new RegExp(`${LANDING_INTEL_FEED_COUNT} live AXE feeds`));
  assert.equal(LANDING_INTEL_FEEDS.filter((feed) => feed.span === 2).length, 3);
  assert.ok(!/\$1\.71B/.test(landing), "do not ship fabricated tide notionals");
  assert.ok(!/SPY 1\.2M/.test(landing), "do not ship fabricated dark-pool prints");
  assert.ok(!/200 aircraft/.test(landing), "do not ship an unverified aircraft count");
});

check("Unusual Whales is only ever disclosed, never advertised", () => {
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

check("the FAQ's 'not subscribed' list matches INTEL_ACTION_SOURCE", () => {
  const item = LANDING_FAQ.find((row) => row.q.includes("Which market intelligence"));
  assert.ok(item, "the intel FAQ must exist");
  const answer = item.a;
  assert.ok(answer.length > 200, "the intel answer is too short to be the real claim");
  const label = {
    darkPoolPrints: "dark-pool prints",
    unusualOptions: "options flow",
    marketTide: "market tide",
    senateTrades: "congressional",
  };
  const uwAt = answer.indexOf("need a paid Unusual Whales");
  assert.ok(uwAt > 0, "the answer must still disclose what Unusual Whales gates");
  const split = answer.lastIndexOf(". ", uwAt) + 1;
  const live = answer.slice(0, split).toLowerCase();
  const paywalled = answer.slice(split).toLowerCase();

  for (const [action, source] of Object.entries(INTEL_ACTION_SOURCE)) {
    const name = label[action]?.toLowerCase();
    if (!name) continue;
    if (source === "unusual_whales") {
      assert.ok(paywalled.includes(name), `${action} needs UW; say so in the disclosure`);
      assert.ok(!live.includes(name), `${action} is not live; it must not be listed as such`);
    } else {
      assert.ok(
        !paywalled.includes(name),
        `${action} runs on "${source}" now — the FAQ must not list it behind Unusual Whales`,
      );
      assert.ok(live.includes(name), `${action} works; the FAQ should say so`);
    }
  }
  assert.ok(
    /Alpha Vantage/.test(answer),
    "the congress feed has a free source now; name it so the claim is checkable",
  );
});

check("pricing is generated from AXE_BILLING_TIERS, not retyped", () => {
  assert.ok(landing.includes("AXE_BILLING_TIERS.map("), "the pricing grid must map the tier list");
  assert.ok(landing.includes("tier.priceEurMonthly"), "prices must be read from the tier");
  assert.ok(landing.includes("tier.includes"), "bullets must come from the tier, not a second list");
});

check("no stale price is hardcoded anywhere on the page", () => {
  const prices = new Set(
    AXE_BILLING_TIERS.map((t) => t.priceEurMonthly).filter((p) => p !== null && p !== 0),
  );
  prices.add(TRADING_OS_FOUNDER_TIER.priceEurMonthly);
  prices.add(TRADING_OS_FOUNDER_TIER.axeFounderPriceEurMonthly);
  for (const [, amount] of landing.matchAll(/€(\d+)/g)) {
    const n = Number(amount);
    const known = prices.has(n) || n === 0;
    assert.ok(known, `€${n} appears on the landing page but is not a price we charge`);
  }
  assert.ok(!/~€19|€19\/mo/.test(landing), "the old ~€19/mo guess must be gone");
});

check("every billed tier is on the page, including Elite", () => {
  const ids = AXE_BILLING_TIERS.map((t) => t.id);
  assert.deepEqual(ids, ["free", "pro", "founder", "elite"]);
  for (const tier of AXE_BILLING_TIERS) {
    assert.ok(landing.includes(`€{tier.priceEurMonthly`) || landing.includes("tier.priceEurMonthly"), "price field");
    assert.ok(
      landing.includes("tier.label") || landing.includes(tier.label),
      `tier ${tier.id} must be renderable`,
    );
  }
});

check("the founder seat cap is read, not retyped, and 0/100 is not hardcoded", () => {
  assert.ok(landing.includes("{FOUNDER_SEAT_CAP}"), "print the cap from the constant");
  assert.equal(FOUNDER_SEAT_CAP, 100);
  assert.ok(!/\b100 seats\b/.test(landing), "a hardcoded seat count would survive a change to the cap");
  assert.ok(!landing.includes("0/100"), "never hardcode an empty Founder counter");
  assert.ok(landing.includes("loadLandingCatalog") || landing.includes("getBillingCatalogState"), "seats come from the DB");
  assert.ok(landing.includes("founderSeatsUsed"), "render the live used count when the catalog loads");
  assert.ok(
    read("src/app/page.tsx").includes('export const dynamic = "force-dynamic"'),
    "the homepage must not statically bake a stale Founder count",
  );
});

check("AXE can execute, and Companion has News", () => {
  const trades = LANDING_FAQ.find((row) => row.q === "Does AXE place trades?");
  assert.ok(trades, "the execution question must be on the page");
  assert.match(trades.a, /Yes/i);
  assert.match(trades.a, /connected broker|safety checks/i);
  assert.ok(!/^No\./.test(trades.a.trim()), "the TOS Phase-1 'No' answer must not ship here");

  const news = LANDING_FAQ.find((row) => /News/.test(row.q));
  assert.ok(news, "a News FAQ must exist");
  assert.match(news.a, /Yes|News surface|cached multi-source/i);
  assert.ok(COMPANION_FEATURES.some((f) => /News/i.test(f.title)), "News belongs in the Companion grid");
});

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

check("the feature grid is Companion-only; TOS stays in the labelled bridge", () => {
  assert.equal(LANDING_TOS_BRIDGE.kicker, "with Trading OS");
  const joined = COMPANION_FEATURES.map((f) => `${f.title} ${f.desc}`).join("\n");
  for (const forbidden of ["QuantLab", "command palette", "sector heatmap", "BIGMAC", "Polymarket"]) {
    assert.ok(!new RegExp(forbidden, "i").test(joined), `${forbidden} is a desk feature — keep it out of the grid`);
  }
  assert.ok(
    LANDING_TOS_BRIDGE.features.some((f) => /QuantLab|multi-chart|command palette/i.test(f)),
    "the bridge must name desk features",
  );
});

check("no fabricated testimonials ship", () => {
  assert.equal(LANDING_TESTIMONIALS.length, 0, "do not invent quotes");
  assert.equal(landingTestimonialsEnabled({}), false);
  for (const name of ["Freya H.", "Thomas M.", "Elena R.", "Sarah L.", "Marcus K."]) {
    assert.ok(!landing.includes(name), `${name} was a sample quote — leave it off`);
  }
  assert.ok(!/Verified quotes\s*6|Avg\.? rating\s*4\.7/i.test(landing), "no fake social proof");
  assert.ok(landing.includes("data-landing-testimonials"), "keep the flagged slot");
});

check("the FIT panel is labelled as example chrome, not live account data", () => {
  assert.match(landing, /Example cockpit chrome/);
  assert.ok(!landing.includes('data-landing-cockpit-example="true"'));
});

check("Try the live demo opens the no-login device mock", () => {
  assert.match(landing, /href="#hero-devices"/);
  assert.ok(hero.includes('id="hero-devices"'));
  assert.ok(hero.includes("/hero-demo/app.html"));
});

check("no href='#' and no bare social domains", () => {
  assert.ok(!/href=['"]#['"]/.test(landing), "in-page links need a real id, not '#'");
  assert.ok(!/https?:\/\/(www\.)?(x|twitter|instagram|facebook|linkedin)\.com/i.test(landing));
});

check("app buttons go to Companion routes", () => {
  for (const href of ['href="/login"', 'href="/signup"', 'href="/welcome"', 'href="/chat"']) {
    assert.ok(landing.includes(href), `${href} should be on the landing`);
  }
});

check("waitlist copy says AXE Companion", () => {
  assert.match(landing, /Join the AXE Companion waitlist/);
  assert.ok(!/Join the Trading OS waitlist/.test(landing));
});

check("the retired drafts redirect to / instead of competing with it", () => {
  for (const route of ["launch", "final", "finallaunch", "ui-premium"]) {
    const file = `src/app/${route}/page.tsx`;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing`);
    const src = read(file);
    assert.ok(src.includes('permanentRedirect("/")'), `${route} must 308 to the one landing page`);
  }
});

check("the stray /landing page is a real redirect, not a client hop", () => {
  assert.ok(
    !existsSync(new URL("../public/landing/index.html", import.meta.url)),
    "a static public/landing/index.html would win over next.config redirects",
  );
  for (const source of ['source: "/landing"', 'source: "/landing/"', 'source: "/landing/index.html"']) {
    assert.ok(nextConfig.includes(source), `${source} must 308 to / in next.config.ts`);
  }
  assert.ok(
    /source:\s*"\/landing\/index\.html"[\s\S]{0,80}destination:\s*"\/"[\s\S]{0,40}permanent:\s*true/.test(nextConfig),
    "/landing/index.html must be a permanent redirect to /",
  );
  const landingRedirects = [...nextConfig.matchAll(/source:\s*"\/landing\/index\.html"/g)];
  assert.equal(landingRedirects.length, 1, "do not duplicate the /landing/index.html redirect");
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
  const header = read("src/components/marketing/landing/LandingHeader.tsx");
  assert.ok(
    header.includes('<AppSwitcher current="companion" />'),
    "the switcher is the cross-app move Luka asked for; it belongs in the header",
  );
  assert.ok(read("src/app/page.tsx").includes("<LandingHeader"), "the page must render the header first");
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

check("AXE Core is in the ecosystem but never public", () => {
  const core = ecosystemApp("axe-core");
  assert.ok(core, "axe-core should still be listed for internal use");
  assert.equal(core.availability, "private");
  assert.ok(
    !PUBLIC_ECOSYSTEM_APPS.some((a) => a.id === "axe-core"),
    "a visitor must never see the operator cockpit in a switcher",
  );
  assert.ok(switcher.includes("PUBLIC_ECOSYSTEM_APPS.map("), "the switcher must render the public list");
  assert.ok(
    !/(?<!PUBLIC_)ECOSYSTEM_APPS/.test(switcher),
    "the switcher must not touch the unfiltered list, which holds AXE Core",
  );
  assert.ok(!landing.includes("axeheadquarters"), "the public landing page must not mention AXE Core at all");
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
  assert.ok(
    switcher.includes("if (!isReachable(app.availability))"),
    "the switcher must render an unreachable surface as text, not a link",
  );
  assert.ok(switcher.includes('aria-disabled="true"'), "an unreachable row must be announced as unavailable");
  assert.ok(
    /tradingOs && isReachable\(tradingOs\.availability\)/.test(landing),
    "the page's own Trading OS button must be gated the same way",
  );
  assert.ok(
    !/>\s*Private beta\s*</.test(landing),
    "the Trading OS badge must come from availabilityLabel, not be retyped",
  );
});

check("Trading OS is linked again now that its own host answers", () => {
  const tos = ecosystemApp("trading-os");
  assert.equal(tos.availability, "beta", "invite-only, but up and linkable");
  assert.ok(isReachable(tos.availability), "the switcher must link out again");
  assert.equal(availabilityLabel(tos.availability), "Private beta");
  assert.ok(
    !landing.includes("Trading OS is between hosts right now") || isReachable(tos.availability),
    "that line may only render for a surface that is genuinely down",
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

check("the switcher closes on Escape and on an outside click", () => {
  assert.ok(switcher.includes('event.key === "Escape"'), "Escape must close it");
  assert.ok(switcher.includes("pointerdown"), "a click outside must close it");
  assert.ok(switcher.includes("removeEventListener"), "listeners must be torn down");
});

check("the menu fits a phone screen", () => {
  assert.ok(/fixed left-3 right-3/.test(switcher), "the panel must span the viewport with a gutter on phones");
  assert.ok(/sm:absolute sm:left-0/.test(switcher), "from sm up it should hang off the trigger like a normal menu");
});

check("the current surface is marked, not linked", () => {
  assert.ok(switcher.includes('aria-current="true"'), "mark where the visitor already is");
  assert.ok(switcher.includes("if (isCurrent)"), "the current app must not be a link to itself");
  assert.ok(
    /const badge = isCurrent \? null :/.test(switcher),
    "the page you are on needs no availability badge — it is visibly up",
  );
});

check("the Trading OS repo keeps the same list", () => {
  const companion = ecosystemApp("companion");
  assert.equal(companion.url, "https://www.axecompanion.com");
  assert.equal(ecosystemApp("trading-os").url, "https://www.tradingosapp.com");
  assert.equal(ecosystemApp("axe-core").url, "https://www.axeheadquarters.com");
});

check("it is reachable by keyboard and announced", () => {
  assert.ok(switcher.includes('aria-haspopup="menu"'));
  assert.ok(switcher.includes("aria-expanded={open}"));
  assert.ok(switcher.includes('role="menu"'));
  assert.ok(/aria-label=\{`\$\{activeName\}/.test(switcher), "the trigger needs a label");
  assert.ok(!/not-sr-only/.test(switcher), "not-sr-only produces no CSS in this build; use hidden/sm:inline");
  assert.ok(
    /hidden whitespace-nowrap sm:inline">Switch app</.test(switcher),
    "the trigger needs a visible label from sm up",
  );
});

check("the hero mock needs no account and makes no network call", () => {
  const heroCode = hero.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\/demo\/embed/.test(heroCode), "the hero must not depend on /demo/embed");
  assert.ok(hero.includes("/hero-demo/app.html"), "the hero runs the self-contained mock");
  for (const forbidden of [/supabase/i, /\bfetch\s*\(/, /\/api\//]) {
    assert.ok(!forbidden.test(heroMock), `the mock must stay self-contained; found ${forbidden}`);
  }
});

check("the mock says it is a demo rather than passing for an account", () => {
  assert.ok(/NO LOGIN/i.test(heroMock), "the mock labels itself");
  assert.ok(/no account needed/i.test(hero), "and the hero says so underneath");
});

check("both devices are there, at real logical sizes", () => {
  assert.ok(/phone: \{ w: 390, h: 844/.test(hero), "iPhone logical size");
  assert.ok(/ipad: \{ w: 1024, h: 768/.test(hero), "iPad logical size");
  assert.ok(hero.includes("width / w"), "the frame scales the iframe to fit");
  assert.ok(heroCss.includes("transform-origin: top left"), "a scaled iframe needs its origin pinned");
});

check("the mock draws no second device inside the bezel", () => {
  assert.ok(hero.includes("chrome=off"), "the hero asks for the chrome-less mode");
  assert.ok(/\.device\.bare::before \{ display: none; \}/.test(heroMock), "chrome=off must hide the mock's own notch");
  assert.ok(/\.device\.bare\.mobile \.topbar/.test(heroMock), "and leave room under the bezel's notch");
});

check("the block lights its dot grid on hover, touch and focus", () => {
  for (const cls of ["axe-hero-dots", "axe-hero-dots-active", "axe-hero-stage-active"]) {
    assert.ok(heroCss.includes(`.${cls}`), `${cls} is missing from globals.css`);
    assert.ok(hero.includes(cls), `${cls} is never applied`);
  }
  assert.ok(hero.includes("onPointerEnter"), "touch must light the block as well");
  assert.ok(hero.includes("onFocusCapture"), "a keyboard user needs the same signal");
  assert.ok(
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,220}axe-hero-dots/.test(heroCss),
    "respect reduced motion",
  );
});

check("the hero placeholder mockup line is gone", () => {
  assert.ok(!/Interactive dashboard mockup loading in future builds/.test(landing));
});

console.log(`\n${passed} checks passed`);
