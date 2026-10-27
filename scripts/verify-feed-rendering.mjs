/**
 * Guards for how the AXE feed renders the three briefs, and that the
 * broadcast writer still has a host crontab scheduler entry.
 *
 * The parser was never the problem — it already split a real morning brief into
 * six labelled sections. The feed threw that away and printed one <p>, and the
 * feed service cut the body at 480 characters before it even got there. Both
 * bugs are invisible by nature: the card still looks "fine", just unreadable
 * and incomplete. Hence these guards.
 *
 * Run: node scripts/verify-feed-rendering.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseBriefSections, sectionDisplayLabel } from "../src/lib/briefing/briefBodyFormat.ts";
import { feedKindStyle } from "../src/lib/feed/feedKindStyle.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const { body } = JSON.parse(readFileSync("scripts/fixtures/morning-brief-2026-10-08.json", "utf8"));
const feedCard = readFileSync("src/components/feed/AxeFeedClient.tsx", "utf8");
const feedService = readFileSync("src/services/axeFeedService.ts", "utf8");
const briefBody = readFileSync("src/components/briefing/BriefBodyContent.tsx", "utf8");

console.log("feed rendering");

check("a real morning brief parses into its labelled sections", () => {
  const sections = parseBriefSections(body);
  const ids = sections.map((s) => s.id);
  assert.deepEqual(ids, [
    "greeting",
    "market_outlook",
    "news",
    "alignment",
    "action_items",
    "watch",
  ]);
  assert.equal(sections.find((s) => s.id === "action_items").paragraphs.length, 3);
});

check("every section except the greeting carries a visible heading", () => {
  for (const section of parseBriefSections(body)) {
    if (section.id === "greeting") continue;
    const label = section.label ?? sectionDisplayLabel(section.id);
    assert.ok(label, `section ${section.id} would render headless`);
  }
});

check("the greeting stays out of the market outlook", () => {
  const sections = parseBriefSections(body);
  const greeting = sections[0].paragraphs.join(" ");
  assert.match(greeting, /Good morning/);
  assert.ok(
    !/MARKET OUTLOOK/i.test(greeting),
    "weather and outlook must not end up in one paragraph",
  );
});

check("the feed card renders sections, not one flattened paragraph", () => {
  assert.ok(/<BriefBodyContent/.test(feedCard), "feed must use the structured renderer");
  assert.ok(
    !/<p className="axe-body mt-1\.5 text-tos-muted">\{stripBriefMarkdown\(item\.body\)\}<\/p>/.test(feedCard),
    "the flattening <p> is back",
  );
});

check("the feed card colours headings by item kind", () => {
  assert.ok(/headingClassName=\{style\.text\}/.test(feedCard));
  assert.ok(/headingClassName/.test(briefBody), "the renderer must accept the accent");
});

check("the three lanes have three distinguishable colours", () => {
  const brief = feedKindStyle("briefing").text;
  const news = feedKindStyle("daily_news").text;
  const recap = feedKindStyle("market_recap").text;
  assert.equal(new Set([brief, news, recap]).size, 3, "two lanes share a colour");
  assert.match(brief, /gold/);
  assert.match(news, /news/);
  assert.match(recap, /emerald/);
});

check("the feed no longer truncates a brief mid-sentence", () => {
  assert.ok(
    !/row\.body \?\? ""\)\.slice\(0, 480\)/.test(feedService),
    "a blind character cut drops whole sections without saying so",
  );
  assert.ok(body.length > 480, "fixture must be long enough for this guard to mean anything");
  const kept = parseBriefSections(body.slice(0, 480)).map((s) => s.id);
  assert.ok(
    !kept.includes("action_items") && !kept.includes("watch"),
    "sanity: the old 480-char cut really did drop the closing sections",
  );
});

console.log("feed cron scheduler");

function cronRouteMentionsBroadcastFeed(name) {
  const routeFile = `src/app/api/cron/${name}/route.ts`;
  const src = readFileSync(routeFile, "utf8");
  const blobs = [src];
  for (const match of src.matchAll(/from\s+"@\/(services\/[^"]+)"/g)) {
    const imported = `src/${match[1]}.ts`;
    try {
      blobs.push(readFileSync(imported, "utf8"));
    } catch {
      // Route imports that are not a single .ts file are not feed writers.
    }
  }
  const text = blobs.join("\n");
  return (
    /axe_broadcast_feed/.test(text) ||
    /runKraterFeedSync|kraterFeedSyncRunner|upsertBroadcastFeedItem/.test(text)
  );
}

check("every /api/cron route the feed uses has a host crontab entry", () => {
  const crontab = readFileSync("scripts/vps.crontab", "utf8");
  const activeLines = crontab
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const cronNames = readdirSync("src/app/api/cron", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const feedRoutes = cronNames
    .filter((name) => cronRouteMentionsBroadcastFeed(name))
    .map((name) => `/api/cron/${name}`);

  assert.ok(
    feedRoutes.includes("/api/cron/krater-feed-sync"),
    "the broadcast writer must be detected as a feed cron route",
  );
  assert.ok(feedRoutes.length >= 1, "the feed must have at least one cron writer");

  for (const path of feedRoutes) {
    const scheduled = activeLines.some((line) => line.includes(path));
    assert.ok(
      scheduled,
      `${path} writes axe_broadcast_feed but has no scheduler entry in scripts/vps.crontab`,
    );
  }

  const feedLine = activeLines.find((line) => line.includes("/api/cron/krater-feed-sync"));
  assert.match(
    feedLine,
    /^\*\/10 4-20 \* \* \*/,
    "krater-feed-sync must stay on */10 4-20 so the Amsterdam 07:00 and 20:00 windows are hit",
  );
});

console.log(`\n${passed} checks passed`);
