/**
 * Structural guards for the auto-journal path.
 *
 * These are invariants, not style checks. Each one encodes a bug that actually
 * shipped and stayed invisible, so a future refactor that quietly reintroduces
 * it fails here instead of in production three weeks later.
 *
 * Run: node scripts/verify-journal-wiring.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const sync = readFileSync("src/lib/mt5/syncCloudAccount.ts", "utf8");
const journal = readFileSync("src/services/journalingService.ts", "utf8");

console.log("journal wiring");

check("a close that arrives on UPDATE still announces the trade", () => {
  assert.ok(/newlyClosed/.test(sync), "open-then-close used to skip the feed entirely");
});

check("the post-sync journal trigger is not gated on new deals", () => {
  assert.ok(
    !/shouldJournal\s*&&\s*dealsUpserted\s*>\s*0/.test(sync),
    "gating on dealsUpserted means AXE only journals in the ten minutes a deal first lands",
  );
  assert.ok(/const shouldJournal = opts\.autoJournal !== false;/.test(sync));
});

check("the journal trigger runs before the no-deals early return", () => {
  const trigger = sync.indexOf("autoJournalTrades(supabase, userId, accountId)");
  const earlyReturn = sync.indexOf('code: "sync_no_deals"');
  assert.ok(trigger > 0, "trigger missing entirely");
  assert.ok(earlyReturn > 0, "early return missing — rewrite this guard");
  assert.ok(
    trigger < earlyReturn,
    "a sync that fetched nothing must still catch up unjournaled trades",
  );
});

check("journaling no longer hard-requires OpenAI", () => {
  assert.ok(
    !/OPENAI_API_KEY not configured/.test(journal),
    "one empty OpenAI wallet should not switch AXE's brain off",
  );
  assert.ok(/llmSimpleChat/.test(journal), "must route through llmRouter for the Ollama fallback");
  assert.ok(!/api\.openai\.com/.test(journal), "no direct provider call left to bypass the router");
});

check("a model failure is recorded, never swallowed", () => {
  assert.ok(/recordLlmFailure\(/.test(journal));
  assert.ok(
    !/console\.error\(`\[axe-journal\] Failed to analyze trade/.test(journal),
    "the old swallow-and-continue path is gone",
  );
});

check("nothing scored plus an operator-level failure is reported as a failure", () => {
  assert.ok(
    /journaled === 0 && blockingFailure/.test(journal),
    "returning { ok: true, journaled: 0 } on a dead provider is the silence we are fixing",
  );
});

check("AXE journal writes populate the NOT NULL label column and check the error", () => {
  assert.ok(/buildAxeJournalLabelRow/.test(journal), "payload builder must set label from axe_label");
  assert.ok(/inErr/.test(journal), "insert errors must not be ignored");
  assert.ok(
    /journaled === 0 && failed > 0/.test(journal),
    "a sweep that scored trades but wrote nothing is a failure",
  );
});

check("a sweep cron exists and is secret-protected", () => {
  const sweep = readFileSync("src/app/api/cron/journal-sweep/route.ts", "utf8");
  assert.ok(/hasCronSecret\(request\.headers\)/.test(sweep));
  assert.ok(/"journal_sweep"/.test(sweep), "sweep runs must be distinguishable in axe_engine_runs");
});


// ───────────────────────────────────────────────────────────────────────────────
// What a score means when AXE could not score it.
//
// Every dimension of the journal breakdown used to be parsed as
// `Number(x) || 15`. That shape cannot tell a missing value from a measured
// one, and it cannot tell a measured zero from either — `0 || 15` is 15. The
// system prompt made it worse by asking for 15 on purpose "rather than
// penalizing", so a trader who had written no playbook got a playbook-
// alignment of 15/25, which the cockpit read as 60/100 under an Execution
// pillar marked available. The alignment score had the same hole: a model
// that returned nothing usable produced a stored, displayed 50.
// ───────────────────────────────────────────────────────────────────────────────

/** The explanations below quote the code they replaced, so match on code only. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");

const journalCode = codeOnly(journal);
const scores = codeOnly(readFileSync("src/services/traderScoresService.ts", "utf8"));
const badge = codeOnly(readFileSync("src/components/journal/AlignmentBadge.tsx", "utf8"));

check("an unjudged dimension is null, not a neutral-looking 15", () => {
  assert.ok(!/\|\| 15\)/.test(journalCode), "`Number(x) || 15` hid both a gap and a real zero");
  assert.ok(/journalDimension/.test(journalCode));
  assert.ok(
    /rule_adherence: number \| null/.test(journalCode),
    "the type has to carry the gap or nothing downstream can respect it",
  );
  assert.ok(
    /return null;/.test(journalCode.slice(journalCode.indexOf("function journalDimension"))),
  );
});

check("the prompt stops asking for a score nobody measured", () => {
  assert.ok(
    !/score that dimension at 15\/25/.test(journal),
    "it used to instruct the model to invent a neutral 15",
  );
  assert.ok(/return null for that dimension/.test(journal));
  assert.ok(/Do NOT substitute a neutral score/.test(journal));
});

check("a trade AXE cannot score is a failure, not a 50", () => {
  assert.ok(
    !/Number\(parsed\.alignment_score\) \|\| 50/.test(journalCode),
    "an empty model response became a stored, displayed score of 50",
  );
  assert.ok(/no usable alignment_score/.test(journalCode));
});

check("a measured zero survives the parse", () => {
  // Number("0") is 0, which is falsy — the whole reason `|| fallback` was wrong.
  assert.ok(
    /Number\.isFinite/.test(journalCode.slice(journalCode.indexOf("function journalDimension"))),
    "finiteness, not truthiness, is the test for a number",
  );
});

check("a null dimension is skipped by the pillars, not counted as zero", () => {
  // Number(null) is 0, so the null guard has to come first or the fix inverts
  // into a different lie: an unjudged dimension dragging the pillar down.
  assert.ok(/value === null \|\| value === undefined/.test(scores));
  assert.ok(/number \| null;/.test(scores));
});

check("patience is AXE's read of the trade, not a threshold on trading style", () => {
  assert.ok(
    !/if \(tradesPerWeek <= 3\) patienceFromFrequency = 85/.test(scores),
    "<=3 trades a week scored 85 and >14 scored 30 — that marks a scalper down for scalping well",
  );
  assert.ok(!/patienceFromHold/.test(scores), "a 15-minute median hold is a style, not impatience");
  assert.ok(/disciplineFromJournal/.test(scores));
  // The facts are still shown, they just no longer stand in for a verdict.
  assert.ok(/median hold \$\{formatHold\(medianHold\)\}/.test(scores));
});

check("the badge says a dimension was not judged instead of drawing an empty bar", () => {
  assert.ok(/NOT_JUDGED/.test(badge));
  assert.ok(/judged \? `\$\{value\}\/25` : NOT_JUDGED/.test(badge), "`null/25` rendered as '/25'");
  assert.ok(/border-dashed/.test(badge), "an unjudged dimension must not look like a score of zero");
});

console.log(`\n${passed} checks passed`);
