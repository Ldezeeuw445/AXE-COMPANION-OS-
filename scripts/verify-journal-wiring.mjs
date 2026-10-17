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

check("a sweep cron exists and is secret-protected", () => {
  const sweep = readFileSync("src/app/api/cron/journal-sweep/route.ts", "utf8");
  assert.ok(/hasCronSecret\(request\.headers\)/.test(sweep));
  assert.ok(/"journal_sweep"/.test(sweep), "sweep runs must be distinguishable in axe_engine_runs");
});

console.log(`\n${passed} checks passed`);
