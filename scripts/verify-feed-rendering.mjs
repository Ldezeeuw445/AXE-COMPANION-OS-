/**
 * Guards for how the AXE feed renders the three briefs.
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
import { readFileSync } from "node:fs";
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

console.log(`\n${passed} checks passed`);
