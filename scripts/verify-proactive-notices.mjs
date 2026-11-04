/**
 * Nothing AXE says first may leave the trader with nowhere to go.
 *
 * Luka's requirement, in his words: every message should immediately say
 * "wat je er aan hebt en wat je er mee kan" — what it means for you, and what
 * you can do with it. Before this, nearly every notice said only what had
 * happened:
 *
 *   "Trade closed: XAUUSD"  ->  "buy +120.50 — cockpit & journal updated"
 *
 * True, and useless at 3am on a phone. It does not say whether AXE thought it
 * was a good trade, or where to look. A notification that cannot be acted on
 * teaches the trader to swipe the next one away, and the one that mattered
 * goes with it.
 *
 * Run: node scripts/verify-proactive-notices.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MAX_NOTICE_BODY,
  noticeGaps,
  renderNoticeBody,
  signedAmount,
} from "../src/lib/axe/notice.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(p, "utf8");
/** The comments quote the bodies they replaced, so match on code only. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const notice = (over = {}) => ({
  title: "Trade closed: XAUUSD",
  what: "buy +120.50",
  soWhat: "AXE has scored it against your rules and playbooks.",
  action: { label: "Read AXE's verdict on it", href: "/journal" },
  ...over,
});

console.log("the shape of a notice");

check("all three parts reach the body, action last", () => {
  const body = renderNoticeBody(notice());
  assert.match(body, /buy \+120\.50/);
  assert.match(body, /scored it against your rules/);
  // Last, because the OS truncates from the end and that is the part the
  // trader is being asked to keep.
  assert.ok(body.endsWith("Read AXE's verdict on it"), body);
});

check("parts are joined on one line, not with newlines", () => {
  // Android collapses a notification to one line and iOS to two, so a newline
  // buys nothing and costs whatever was below it.
  const body = renderNoticeBody(notice());
  assert.ok(!body.includes("\n"));
  assert.match(body, / · /);
});

check("a notice with nothing honest to add just leaves it out", () => {
  const body = renderNoticeBody(notice({ soWhat: null }));
  assert.equal(body, "buy +120.50 · Read AXE's verdict on it");
  assert.ok(!body.includes("··"), "no empty separator where the part would have been");
});

check("whitespace in any part cannot break the line", () => {
  const body = renderNoticeBody(
    notice({ what: "  buy\n  +120.50 ", soWhat: "   ", action: { label: " Go  now ", href: "/x" } }),
  );
  assert.equal(body, "buy +120.50 · Go now");
});

console.log("\nwhat survives a truncating OS");

check("an over-long notice drops the meaning, never the next step", () => {
  const body = renderNoticeBody(
    notice({ soWhat: "x".repeat(MAX_NOTICE_BODY), action: { label: "Approve or discard it", href: "/actions" } }),
  );
  assert.ok(body.length <= MAX_NOTICE_BODY);
  assert.ok(body.endsWith("Approve or discard it"), body);
  assert.match(body, /buy \+120\.50/, "the fact survives too when it fits");
});

check("even an absurd fact cannot push the action out", () => {
  const body = renderNoticeBody(
    notice({ what: "y".repeat(1000), soWhat: null, action: { label: "Reconnect the account", href: "/accounts" } }),
  );
  assert.ok(body.length <= MAX_NOTICE_BODY);
  assert.ok(body.endsWith("Reconnect the account"), body);
});

check("an action longer than the whole body still reaches the trader", () => {
  const body = renderNoticeBody(
    notice({ what: "y".repeat(500), soWhat: null, action: { label: "z".repeat(MAX_NOTICE_BODY + 50), href: "/x" } }),
  );
  assert.ok(body.length <= MAX_NOTICE_BODY);
  assert.ok(body.startsWith("z"), "the instruction is what is kept");
});

console.log("\nwhat counts as an instruction");

check("a complete notice has no gaps", () => {
  assert.deepEqual(noticeGaps(notice()), []);
});

check("an empty part is caught even though the type allows it", () => {
  assert.ok(noticeGaps(notice({ what: "   " })).some((g) => /what happened/.test(g)));
  assert.ok(noticeGaps(notice({ title: "" })).some((g) => /no title/.test(g)));
  assert.ok(
    noticeGaps(notice({ action: { label: "  ", href: "/journal" } })).some((g) => /what to do/.test(g)),
  );
});

check("an action has to point somewhere in the app", () => {
  assert.ok(
    noticeGaps(notice({ action: { label: "Open it", href: "https://example.com" } })).some((g) =>
      /does not point anywhere/.test(g),
    ),
  );
  assert.ok(noticeGaps(notice({ action: { label: "Fix it", href: "" } })).length > 0);
});

check("'View' is a shrug and is rejected as one", () => {
  // These are what a label says when nobody decided what the trader should
  // actually do with the notice.
  for (const label of ["View", "open", "See", "check", "More", "details", "Detail"]) {
    assert.ok(
      noticeGaps(notice({ action: { label, href: "/journal" } })).some((g) => /shrug/.test(g)),
      `"${label}" should have been rejected`,
    );
  }
  // And a real instruction containing one of those words is fine.
  assert.deepEqual(noticeGaps(notice({ action: { label: "See the stack", href: "/positions" } })), []);
});

check("a signed amount reads the way a trader reads it", () => {
  assert.equal(signedAmount(120.5), "+120.50");
  assert.equal(signedAmount(-40), "-40.00");
  assert.equal(signedAmount(0), "+0.00");
  assert.equal(signedAmount(Number.NaN), "0.00", "never 'NaN' on a lock screen");
});

console.log("\nevery producer goes through it");

const watcher = read("src/services/axeProactiveWatcher.ts");
const watcherCode = codeOnly(watcher);

check("the watcher checks people who just traded, not the first idle accounts", () => {
  assert.ok(/collectWatcherCandidates/.test(watcherCode));
  assert.ok(/TRADE_CLOSE_LOOKBACK_MS/.test(watcherCode));
  assert.ok(/tradeCloseEventKey/.test(watcherCode));
});

check("there is one writer, and the old one is gone", () => {
  assert.ok(
    !/recordProactiveEvent/.test(watcherCode),
    "the title, body and URL were repeated three times per notice and the push drifted from the feed row",
  );
  assert.equal(
    (watcherCode.match(/from\("axe_proactive_events"\)\s*\.insert/g) ?? []).length,
    1,
    "exactly one place writes a notice",
  );
});

check("every notice the watcher sends names its next step", () => {
  // Nine producers: the original eight plus the live drawdown / daily-limit
  // warning, which has to name the next step the same way as the rest.
  const EXPECTED_PRODUCERS = 9;
  const calls = watcherCode.match(/announce\(supabase, userId, \{/g) ?? [];
  assert.equal(
    calls.length,
    EXPECTED_PRODUCERS,
    `expected ${EXPECTED_PRODUCERS} notice producers, found ${calls.length}`,
  );
  // Count the keys, not the shape of the object around them: an action label
  // is a template literal in at least one producer, so `[^}]*href:` stops at
  // the `}` of the interpolation and silently undercounts.
  const actionKeys = watcherCode.match(/^\s*action:/gm) ?? [];
  assert.equal(
    actionKeys.length,
    EXPECTED_PRODUCERS,
    `every producer needs an action, found ${actionKeys.length}`,
  );
  // At least one per action, and more where a producer picks between two
  // destinations — the news notice sends you to your positions or to the feed.
  const hrefs = watcherCode.match(/href: /g) ?? [];
  assert.ok(
    hrefs.length >= EXPECTED_PRODUCERS,
    `every action needs a destination, found ${hrefs.length}`,
  );
});

check("the push body is the feed body, not a second version of it", () => {
  // They used to be assembled separately at each producer, which is how they
  // drift: the lock screen said one thing and the feed another.
  const announce = watcherCode.slice(watcherCode.indexOf("async function announce"));
  assert.ok(/const body = renderNoticeBody\(opts\.notice\)/.test(announce));
  assert.equal(
    (announce.match(/renderNoticeBody/g) ?? []).length,
    1,
    "rendered once and used for both",
  );
  assert.ok(/url: opts\.notice\.action\.href/.test(announce), "and the row links where the action says");
});

check("a duplicate notice is still dropped silently", () => {
  // Saying the same thing twice is how a useful notice becomes one the trader
  // swipes away without reading, and the unique index is what prevents it.
  const announce = watcherCode.slice(watcherCode.indexOf("async function announce"));
  assert.ok(/error\.code === "23505"/.test(announce));
  assert.ok(/return \{ created: 0, pushed: 0 \}/.test(announce));
});

check("the trade-closed notice stopped describing the app's housekeeping", () => {
  assert.ok(
    !/cockpit & journal updated/.test(watcherCode),
    "that described what the app did, not anything about the trade",
  );
  assert.ok(/Read AXE's verdict on it/.test(watcher));
});

check("the pending-trade notice says how long it has been waiting", () => {
  // A setup valid twenty minutes ago may not be now, and that is the whole
  // reason the notice exists.
  assert.ok(/Waiting \$\{minutes\}m/.test(watcher));
  assert.ok(/nothing goes to your broker until you approve it/.test(watcher));
});

check("the weekend notice says which of the two risks applies", () => {
  // A rule you can breach is not the same risk as a gap you can only sit
  // through, and the trader should know which one is theirs.
  assert.ok(/accountProfile\.weekendHoldingAllowed\s*\n?\s*\?/.test(watcher));
  assert.ok(/your stop cannot fill inside it/.test(watcher));
  assert.ok(/rules do not allow it/.test(watcher));
});

check("a broken broker feed says what it costs, not just that it broke", () => {
  assert.ok(/working from stale prices and cannot place or close anything/.test(watcher));
});

console.log(`\n${passed} checks passed`);
