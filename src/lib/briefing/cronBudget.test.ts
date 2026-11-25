import { test } from "node:test";
import assert from "node:assert/strict";
import { runBatchWithinBudget } from "./cronBudget";

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test("runs every item when there is time", async () => {
  const c = clock();
  const seen: number[] = [];
  const r = await runBatchWithinBudget([1, 2, 3], async (n) => { seen.push(n); c.advance(10); }, { budgetMs: 1000, now: c.now });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.deepEqual(r, { processed: 3, failed: 0, deferred: 0 });
});

test("stops starting new items once the budget is spent (pg_net 120 s timeout)", async () => {
  const c = clock();
  const seen: number[] = [];
  const items = Array.from({ length: 10 }, (_, i) => i);
  const r = await runBatchWithinBudget(items, async (n) => { seen.push(n); c.advance(30_000); }, { budgetMs: 90_000, now: c.now });
  assert.deepEqual(seen, [0, 1, 2]);
  assert.deepEqual(r, { processed: 3, failed: 0, deferred: 7 });
});

test("retries once, counts a second failure as failed", async () => {
  const c = clock();
  let calls = 0;
  const r = await runBatchWithinBudget(["a"], async () => { calls++; throw new Error("x"); }, { budgetMs: 10_000, now: c.now, retryDelayMs: 0 });
  assert.equal(calls, 2);
  assert.deepEqual(r, { processed: 0, failed: 1, deferred: 0 });
});

test("a failure with no time left for the retry is deferred, not failed", async () => {
  const c = clock();
  const r = await runBatchWithinBudget(["a", "b"], async () => { c.advance(95_000); throw new Error("slow"); }, { budgetMs: 90_000, now: c.now, retryDelayMs: 1500 });
  assert.deepEqual(r, { processed: 0, failed: 0, deferred: 2 });
});
