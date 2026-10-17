/**
 * Verification for src/lib/ops/llmFailure.ts
 *
 * Run: node scripts/verify-llm-failure.mjs
 *
 * The repo has no test runner, so verification scripts stand in for one.
 * This file asserts the behaviour that actually bit us in production on
 * 2026-10-10 — a credits failure that arrives dressed as HTTP 429.
 */
import assert from "node:assert/strict";
import {
  classifyLlmFailure,
  redactSecrets,
  noteLlmFailure,
  noteLlmSuccess,
  blockingLlmFailure,
  llmHealthSnapshot,
  __resetLlmHealth,
} from "../src/lib/ops/llmFailure.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("llmFailure");

/* The exact string production returned, verbatim from axe_ops.cron_run. */
const REAL_OPENAI_429 = Object.assign(
  new Error(
    '429 Too Many Requests — {"error": {"message": "You have no credits remaining. ' +
      'Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.", ' +
      '"type": "insufficient_quota"}}',
  ),
  { status: 429 },
);

check("a credits failure is NOT read as a rate limit, even on HTTP 429", () => {
  const f = classifyLlmFailure(REAL_OPENAI_429);
  assert.equal(f.reason, "no_credits");
  assert.equal(f.retryable, false, "retrying an empty wallet is a loop");
  assert.equal(f.needsOperator, true);
});

check("a genuine rate limit stays retryable", () => {
  const f = classifyLlmFailure(Object.assign(new Error("429 Rate limit reached for gpt-4o-mini"), { status: 429 }));
  assert.equal(f.reason, "rate_limited");
  assert.equal(f.retryable, true);
  assert.equal(f.needsOperator, false);
});

check("a bad key needs an operator", () => {
  const f = classifyLlmFailure(Object.assign(new Error("401 Incorrect API key provided"), { status: 401 }));
  assert.equal(f.reason, "auth_failed");
  assert.equal(f.needsOperator, true);
});

check("a dead Ollama tunnel is unreachable and retryable", () => {
  const f = classifyLlmFailure(new Error("fetch failed"));
  assert.equal(f.reason, "unreachable");
  assert.equal(f.retryable, true);
});

check("an unparseable answer is transient, not an outage", () => {
  const f = classifyLlmFailure(new SyntaxError("Unexpected token < in JSON at position 0"));
  assert.equal(f.reason, "bad_response");
  assert.equal(f.needsOperator, false);
});

check("a 500 from the provider is unreachable, not unknown", () => {
  const f = classifyLlmFailure(Object.assign(new Error("500 Internal Server Error"), { status: 500 }));
  assert.equal(f.reason, "unreachable");
});

check("API keys never survive classification", () => {
  const f = classifyLlmFailure(
    new Error('401 invalid key: sk-proj-ABCDEFGHIJKLMNOP1234567890 — header "Authorization: Bearer sk-live-ZZZZZZZZZZZZ"'),
  );
  assert.ok(!f.message.includes("sk-proj-ABCDEFGHIJKLMNOP1234567890"), "leaked the key");
  assert.ok(!f.message.includes("sk-live-ZZZZZZZZZZZZ"), "leaked the bearer token");
  assert.ok(f.message.includes("[redacted]"));
});

check("redactSecrets keeps the surrounding sentence readable", () => {
  const out = redactSecrets("could not auth with sk-abcdefghijklmnop while syncing");
  assert.equal(out, "could not auth with [redacted] while syncing");
});

check("a nested cause is still classified", () => {
  const outer = new Error("journal batch failed", { cause: new Error("You have no credits remaining.") });
  assert.equal(classifyLlmFailure(outer).reason, "no_credits");
});

check("registry: a success clears the consecutive count but keeps the total", () => {
  __resetLlmHealth();
  noteLlmFailure("journal", classifyLlmFailure(REAL_OPENAI_429));
  noteLlmFailure("journal", classifyLlmFailure(REAL_OPENAI_429));
  let entry = llmHealthSnapshot().find((e) => e.source === "journal");
  assert.equal(entry.consecutiveFailures, 2);
  assert.equal(entry.totalFailures, 2);

  noteLlmSuccess("journal");
  entry = llmHealthSnapshot().find((e) => e.source === "journal");
  assert.equal(entry.consecutiveFailures, 0);
  assert.equal(entry.totalFailures, 2, "history must not be erased by one good call");
});

check("blockingLlmFailure surfaces exactly what a human must fix", () => {
  __resetLlmHealth();
  noteLlmFailure("intel", classifyLlmFailure(new Error("fetch failed")));
  assert.equal(blockingLlmFailure(), null, "a transient blip is not an operator problem");

  noteLlmFailure("journal", classifyLlmFailure(REAL_OPENAI_429));
  const blocking = blockingLlmFailure();
  assert.equal(blocking.source, "journal");
  assert.equal(blocking.failure.reason, "no_credits");
  assert.match(blocking.advice, /Top up/);
});

check("a recovered source stops blocking", () => {
  noteLlmSuccess("journal");
  assert.equal(blockingLlmFailure(), null);
});

__resetLlmHealth();
console.log(`\n${passed} checks passed`);
