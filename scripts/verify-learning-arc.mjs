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

console.log(`\n${passed} checks passed`);
