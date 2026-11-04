/**
 * Verification for src/lib/axe/learningStage.ts
 *
 * Luka's ask was "you should be able to SEE it growing with you". The existing
 * arc showed a present-tense profile — top pairs, top timeframes — which has
 * no direction in it at all.
 *
 * The thing to guard here is honesty. A progress bar that creeps up on its own
 * is worse than no bar: it makes the real one untrustworthy. So: a trader with
 * nothing must score nothing, a month where nothing happened must say so, and
 * every point must trace back to a row that exists.
 *
 * Run: node scripts/verify-learning-arc.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { learningStage, learningPoints, stageProgress } from "../src/lib/axe/learningStage.ts";
import {
  arcHeadline,
  normaliseAlignment,
  normaliseSymbol,
  rankTradedSymbols,
  sessionOfHourUtc,
  sessionSplit,
  summariseFeedback,
  SESSION_MIN_TRADES,
  ARC_WINDOW_DAYS,
} from "../src/lib/axe/learningArc.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const empty = { memories: 0, journaledTrades: 0, rules: 0, playbooks: 0, proactiveNotices: 0 };
const counts = (o) => ({ ...empty, ...o });

console.log("learningStage");

check("a brand new trader scores zero and is told what to do first", () => {
  const arc = learningStage(empty);
  assert.equal(arc.points, 0);
  assert.equal(arc.stage, 0);
  assert.match(arc.summary, /nothing of yours to work from/);
  assert.match(arc.nextStep, /Connect your account/);
});

check("the bar only moves on things that exist", () => {
  assert.equal(learningPoints(empty), 0);
  assert.equal(learningPoints(counts({ journaledTrades: 10 })), 30);
  assert.equal(learningPoints(counts({ rules: 2 })), 10);
  // Nonsense input cannot inflate it.
  assert.equal(learningPoints(counts({ memories: -5 })), 0);
  assert.equal(learningPoints(counts({ memories: Number.NaN })), 0);
});

check("a stated rule outweighs a remembered fact", () => {
  assert.ok(
    learningPoints(counts({ rules: 1 })) > learningPoints(counts({ memories: 2 })),
    "a rule the trader wrote down is the clearest statement of intent AXE gets",
  );
});

check("stages move in order and never skip backwards", () => {
  let last = -1;
  for (const n of [0, 5, 20, 50, 120, 400]) {
    const arc = learningStage(counts({ journaledTrades: Math.round(n / 3) }));
    assert.ok(arc.stage >= last, "stage went backwards as points went up");
    last = arc.stage;
  }
});

check("a month where nothing happened says nothing happened", () => {
  const same = counts({ memories: 10, journaledTrades: 20 });
  const arc = learningStage(same, same);
  assert.equal(arc.growth.points, 0);
  assert.equal(arc.growth.summary, null, "an unchanged month must not be dressed up as progress");
});

check("real growth is named in the trader's terms, with the numbers", () => {
  const before = counts({ memories: 4, journaledTrades: 10, rules: 1 });
  const now = counts({ memories: 9, journaledTrades: 22, rules: 2 });
  const arc = learningStage(now, before);
  assert.ok(arc.growth.points > 0);
  assert.match(arc.growth.summary, /5 things it remembers about you/);
  assert.match(arc.growth.summary, /12 trades scored/);
  assert.match(arc.growth.summary, /1 rule of yours/, "singular must read as singular");
});

check("growth is null when there is no history to compare against", () => {
  assert.equal(learningStage(counts({ memories: 3 })).growth, null);
});

check("the top stage stops promising a next step", () => {
  const arc = learningStage(counts({ rules: 20, playbooks: 20, journaledTrades: 60 }));
  assert.equal(arc.nextStep, null);
  assert.equal(arc.pointsForNextStage, null);
  assert.equal(stageProgress(arc), 1);
});

check("progress stays inside the bar", () => {
  for (const n of [0, 1, 7, 44, 99, 199, 5000]) {
    const p = stageProgress(learningStage(counts({ memories: n })));
    assert.ok(p >= 0 && p <= 1, `progress out of range at ${n}: ${p}`);
  }
});

console.log("scope + wiring");
const service = readFileSync("src/services/learningGrowthService.ts", "utf8");

check("AXE Intel gets its own arc, not a copy of AXE's", () => {
  assert.ok(/scope === "intel"/.test(service));
  assert.ok(
    /journaledTrades: 0/.test(service),
    "Intel does not journal trades; counting them would move its arc for the wrong reason",
  );
});

check("a count that cannot be read is zero, never a guess", () => {
  assert.ok(/if \(error\) return 0;/.test(service));
  assert.ok(/catch \{\s*return 0;/.test(service), "an arc that inflates on a slow database is worthless");
});

check("the arc reaches the trader, not just the cockpit", () => {
  const screen = readFileSync("src/components/journal/JournalScreen.tsx", "utf8");
  assert.ok(/<LearningArcPanel/.test(screen), "it was only ever visible in the cockpit");
});


// ───────────────────────────────────────────────────────────────────────────────
// The present-tense half of the arc: what AXE has measured about how you trade.
//
// This is where the lies were. A trader with no closed trades was shown
// "Top pair: EURUSD · H1", told their session was London, given an alignment
// of 50% and — inside the morning-brief prompt, under "Key facts" — "Key
// indicators they use: RSI, MACD, MA". All five were constants in the source,
// and the panel above them said "no fake milestones, only signals you actually
// sent". These checks are what stop any of it coming back.
// ───────────────────────────────────────────────────────────────────────────────

console.log("\nlearningArc — measured, or empty");

const trade = (o) => ({ symbol: null, pnl: null, openTime: null, closeTime: null, ...o });

check("a broker suffix does not split one instrument into four", () => {
  assert.equal(normaliseSymbol("XAUUSD.r"), "XAUUSD");
  assert.equal(normaliseSymbol("eurusd-ecn"), "EURUSD");
  assert.equal(normaliseSymbol("  gbpusd_pro "), "GBPUSD");
  // A numeric tail is part of the name, not a suffix.
  assert.equal(normaliseSymbol("US30"), "US30");
  assert.equal(normaliseSymbol("SPX500"), "SPX500");
  assert.equal(normaliseSymbol(null), "");
});

check("instruments are ranked by closed trades, with the count that proves it", () => {
  const ranked = rankTradedSymbols([
    trade({ symbol: "XAUUSD", pnl: 120 }),
    trade({ symbol: "xauusd.r", pnl: -40 }),
    trade({ symbol: "EURUSD", pnl: 10 }),
  ]);
  assert.equal(ranked.length, 2);
  assert.deepEqual(ranked[0], { symbol: "XAUUSD", trades: 2, netPnl: 80 });
  assert.equal(ranked[1].symbol, "EURUSD");
});

check("no trades means no pairs — not a plausible three", () => {
  assert.deepEqual(rankTradedSymbols([]), []);
  const headline = arcHeadline(null, 0, 0);
  assert.equal(headline, null, "an empty account must have nothing to say, not something to claim");
});

check("the headline states the share it was counted from", () => {
  const line = arcHeadline({ symbol: "XAUUSD", trades: 23, netPnl: 0 }, 61, 4);
  assert.match(line, /XAUUSD/);
  assert.match(line, /23 of your 61 closed trades/, "a rank with no denominator cannot be checked");
});

check("watched charts are named as watched, never as traded", () => {
  const line = arcHeadline(null, 0, 3);
  assert.match(line, /No closed trades yet/);
  assert.match(line, /watching 3 symbols/);
});

check("a session preference needs a sample, and a tie is not a preference", () => {
  assert.equal(sessionSplit([]).session, null, "zero trades used to resolve to london");
  const four = Array.from({ length: 4 }, () =>
    trade({ openTime: "2026-10-01T09:00:00Z" }),
  );
  assert.ok(four.length < SESSION_MIN_TRADES);
  assert.equal(sessionSplit(four).session, null, "four entries is not a habit");

  const tied = [
    ...Array.from({ length: 3 }, () => trade({ openTime: "2026-10-01T09:00:00Z" })),
    ...Array.from({ length: 3 }, () => trade({ openTime: "2026-10-01T15:00:00Z" })),
  ];
  assert.equal(sessionSplit(tied).session, null, "a 3-3 split must not be decided by key order");
});

check("the session comes from the entry, not the exit", () => {
  // Entered in London, held until the New York afternoon. Reading close_time
  // called this a New York trader.
  const held = Array.from({ length: 6 }, () =>
    trade({ openTime: "2026-10-01T08:00:00Z", closeTime: "2026-10-01T19:00:00Z" }),
  );
  const split = sessionSplit(held);
  assert.equal(split.session, "london");
  assert.equal(split.basis, "open");
  assert.equal(split.counts.london, 6);
  assert.equal(split.counts.newyork, 0);
});

check("an entry with no open time falls back to the close, and says so", () => {
  const split = sessionSplit(
    Array.from({ length: 6 }, () => trade({ closeTime: "2026-10-01T14:00:00Z" })),
  );
  assert.equal(split.session, "newyork");
  assert.equal(split.basis, "close", "the trader can see which timestamp this came from");
});

check("session windows cover the clock exactly once", () => {
  const seen = { london: 0, newyork: 0, asia: 0 };
  for (let h = 0; h < 24; h += 1) seen[sessionOfHourUtc(h)] += 1;
  assert.equal(seen.london + seen.newyork + seen.asia, 24);
  assert.equal(seen.london, 5);
  assert.equal(seen.newyork, 9);
  assert.equal(seen.asia, 10);
});

check("an unmeasured alignment is null, never 50", () => {
  assert.equal(normaliseAlignment(null), null);
  assert.equal(normaliseAlignment(undefined), null);
  assert.equal(normaliseAlignment(""), null);
  assert.equal(normaliseAlignment("not a number"), null);
  assert.equal(normaliseAlignment(140), null, "out of range is unknown, not clamped to a score");
  // Both historic storage shapes still read correctly.
  assert.equal(normaliseAlignment(0.62), 62);
  assert.equal(normaliseAlignment(62), 62);
  assert.equal(normaliseAlignment(0), 0, "a measured zero is not the same as no measurement");
});

console.log("\nchat feedback — the thumbs that were already there");

check("votes are counted, not hardcoded to zero", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const summary = summariseFeedback(
    [
      { rating: "up", at: "2026-10-19T10:00:00Z" },
      { rating: "up", at: "2026-10-12T10:00:00Z" },
      { rating: "down", at: "2026-10-05T10:00:00Z" },
      { rating: "up", at: null },
    ],
    now,
  );
  assert.equal(summary.up, 3);
  assert.equal(summary.down, 1);
});

check("the four-week bar always has four weeks, oldest first", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const summary = summariseFeedback([{ rating: "up", at: "2026-10-19T10:00:00Z" }], now);
  assert.equal(summary.weekly.length, 4);
  assert.equal(summary.weekly[3].up, 1, "a vote from yesterday belongs in the newest bucket");
  assert.equal(summary.weekly[0].up, 0);
});

check("a vote with no timestamp counts but is not placed in a week", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const summary = summariseFeedback([{ rating: "up", at: null }], now);
  assert.equal(summary.up, 1);
  assert.equal(
    summary.weekly.reduce((sum, w) => sum + w.up + w.down, 0),
    0,
    "dropping it into this week would show activity in a week where none happened",
  );
});

check("a vote older than the window is in the totals, not in the bars", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const summary = summariseFeedback([{ rating: "down", at: "2026-01-01T10:00:00Z" }], now);
  assert.equal(summary.down, 1);
  assert.equal(summary.weekly.reduce((sum, w) => sum + w.down, 0), 0);
});

console.log("\nno invented constants in the service layer");

/**
 * These checks assert that old code is gone, and the comments explaining why
 * quote that code verbatim — on purpose, so the next reader knows what the
 * line used to say. So match against the source with its block comments
 * removed, or every check would find its own explanation and pass (or, worse,
 * fail) on prose.
 */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");

const arcService = codeOnly(readFileSync("src/services/learningArcService.ts", "utf8"));
const cockpit = codeOnly(readFileSync("src/services/cockpitService.ts", "utf8"));
const briefing = codeOnly(readFileSync("src/services/axeDailyBriefingService.ts", "utf8"));
const snapshots = codeOnly(readFileSync("src/services/cockpitSnapshotService.ts", "utf8"));
const arcPanel = codeOnly(readFileSync("src/components/cockpit/CockpitLearningArc.tsx", "utf8"));

check("the stand-in pairs, timeframes and indicators are gone", () => {
  for (const source of [arcService, cockpit, briefing]) {
    assert.ok(
      !/\["EURUSD", "XAUUSD", "GBPUSD"\]/.test(source),
      "a trader with no history was told these were their top pairs",
    );
    assert.ok(!/\["H1", "H4", "D1"\]/.test(source));
    assert.ok(
      !/\["RSI", "MACD", "MA"\]/.test(source),
      "indicators live in localStorage only — the server cannot know them, so it must not claim to",
    );
  }
  assert.ok(!/topIndicators/.test(briefing), "the brief must not state indicators it never measured");
});

check("a failed read is distinguishable from an empty account", () => {
  assert.ok(/dataUnavailable/.test(arcService));
  assert.ok(
    /Boolean\(tradesRes\.error\)/.test(arcService),
    "`?? []` turned an outage into 'this trader has never traded'",
  );
});

check("the focus list carries trade counts, not its own row numbers", () => {
  assert.ok(
    !/Math\.max\(1, 5 - i\)/.test(cockpit),
    "the '5 signals / 4 signals / 3 signals' beside each pair was the row index",
  );
  assert.ok(/count: pair\.trades/.test(cockpit));
  assert.ok(/trade\{item\.count === 1 \? "" : "s"\}/.test(arcPanel), "and the label must say trades");
});

check("chat feedback is read back from where it is stored", () => {
  assert.ok(
    !/messageFeedback: \{ up: 0, down: 0 \},\s*\n\s*weeklyFeedbackTrend: \[\],\s*\n\s*\};/.test(cockpit),
    "the mapper hardcoded both, so thumbs the trader had pressed never showed",
  );
  assert.ok(/metadata->>feedback/.test(cockpit));
  assert.ok(/fetchMessageFeedback/.test(cockpit));
});

check("a missing alignment score cannot become a sentence with a number in it", () => {
  assert.ok(/alignment: number \| null/.test(briefing));
  assert.ok(
    /alignment === null/.test(briefing),
    "with a plain number a missing score arrived as 0: \"You're at 0% aligned — AXE knows your style well.\"",
  );
  assert.ok(!/alignment: 0,/.test(briefing));
});

check("the brief separates the session that is open from the session they trade", () => {
  assert.ok(/Session open as this is written/.test(briefing));
  assert.ok(/Session they actually enter in/.test(briefing));
  assert.ok(
    /not enough closed trades to say/.test(briefing),
    "the model must be told there is no answer, not handed a default",
  );
});

check("the engine and the arc cannot disagree about what alignment means", () => {
  const engine = codeOnly(readFileSync("src/services/axeEngineService.ts", "utf8"));
  // The column has held both 0-1 floats and 0-100 integers. Two readers with
  // two conversions is how one screen ends up showing 62 and another 0.62.
  assert.ok(/normaliseAlignment/.test(engine));
  assert.ok(
    !/rawAlignment > 1 \?/.test(engine),
    "the engine had its own conversion of the same column",
  );
  // Confidence sets the gate mode, so an unmeasured alignment has to land on
  // the cautious end — but it has to be legible as a default, not a reading.
  assert.ok(/alignmentMeasured/.test(engine), "rationale is what a trader reads to check a score");
});

check("the model may rewrite the words but not the numbers", () => {
  assert.ok(/mergeMilestoneNarratives/.test(snapshots));
  assert.ok(
    !/milestones: Array\.isArray\(parsed\.milestones\) \? parsed\.milestones/.test(snapshots),
    "every progress bar under 'AXE will not show fake progress' was the model's to change",
  );
  assert.ok(/keepsOurNumbers/.test(snapshots));
});

check("the headline quotes the window it actually counted over", () => {
  // Validated against the live database on 29 October: 16 closed trades for
  // one trader, 15 XAUUSD and 1 BTCUSD, matching an independent SQL count
  // exactly. What did not match was the sentence: the window lived in
  // learningArcService as ARC_WINDOW_DAYS while the headline said the literal
  // "90 days". Two places for one fact. Set the window to 30 and the headline
  // keeps saying 90 over a count that is really 30 days long — and every
  // number here is meant to be checkable against the trader's own journal.
  const top = { symbol: "XAUUSD", trades: 15, netPnl: -1565.8 };

  const asShipped = arcHeadline(top, 16, 0);
  assert.ok(
    asShipped.includes(`${ARC_WINDOW_DAYS} days`),
    `the default must name the real window: "${asShipped}"`,
  );

  const narrowed = arcHeadline(top, 16, 0, 30);
  assert.ok(narrowed.includes("30 days"), `a different window must change the sentence: "${narrowed}"`);
  assert.ok(!narrowed.includes("90 days"), "and must not still claim 90");
});

check("the window is defined once, not copied into the service", () => {
  const service = readFileSync(
    new URL("../src/services/learningArcService.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    !/const ARC_WINDOW_DAYS = \d+/.test(service),
    "a second definition is how the headline and the query drift apart",
  );
  assert.ok(/ARC_WINDOW_DAYS/.test(service), "the service still uses it for the query");
});

check("real-world symbol suffixes normalise the way the live data needs", () => {
  // These exact spellings are in the production table: one broker writes
  // XAUUSD and XAUUSD.x for the same instrument, and BTCUSD.nx for another.
  // Without stripping, one trader's gold shows up as two instruments and the
  // "most traded" line is wrong about what they actually trade.
  assert.equal(normaliseSymbol("XAUUSD.x"), "XAUUSD");
  assert.equal(normaliseSymbol("BTCUSD.nx"), "BTCUSD");
  assert.equal(normaliseSymbol("XAUUSD"), "XAUUSD");
  // And the ones that must survive, because the digits are part of the name.
  assert.equal(normaliseSymbol("US30"), "US30");
  assert.equal(normaliseSymbol("SPX500"), "SPX500");
});

console.log(`\n${passed} checks passed`);
