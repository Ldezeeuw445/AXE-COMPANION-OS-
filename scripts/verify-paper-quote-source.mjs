/**
 * Where a paper fill got its price, and why that has to travel with it.
 *
 * The demo account prices itself with a seeded random walk. That is fine for
 * practising the mechanics and worthless as a measurement — but it flows into
 * the same `broker_trades` rows that `playbookEdge` reads, and that function
 * turns closed trades into sentences about the *trader*: "your London XAUUSD
 * longs win 64% of the time". Let simulated fills into that and a random
 * number generator gets reported back to someone as their edge.
 *
 * So these checks are mostly one worry: the origin must survive, and only a
 * live price may count as evidence.
 *
 * Run: node scripts/verify-paper-quote-source.mjs
 */
import assert from "node:assert/strict";

import {
  MAX_QUOTE_AGE_MS,
  countsAsEvidence,
  describeQuoteOrigin,
  quoteFromSnapshot,
  simulatedQuote,
} from "../src/lib/trading/paperQuoteSource.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const at = (secondsAgo) => new Date(NOW - secondsAgo * 1000).toISOString();
const row = (over = {}) => ({
  last_bid: 1899.5,
  last_ask: 1900.0,
  last_tick_at: at(2),
  ...over,
});

console.log("a live price, and only when it really is one");

check("a fresh bid/ask is live", () => {
  const r = quoteFromSnapshot(row(), NOW);
  assert.equal(r.origin, "live");
  assert.deepEqual(r.quote, { bid: 1899.5, ask: 1900.0 });
  assert.equal(r.ageMs, 2000);
});

check("a stale tick is refused, not filled against", () => {
  // The failure this prevents: the feed died, the market moved, and the
  // simulator hands out a profit that was never available.
  const stale = quoteFromSnapshot(row({ last_tick_at: at(MAX_QUOTE_AGE_MS / 1000 + 30) }), NOW);
  assert.equal(stale.origin, "none");
  assert.ok(/stale/.test(stale.reason), stale.reason);
  assert.ok(/\d+s old/.test(stale.reason), "say how old, so it can be judged");
});

check("the staleness line is drawn where the file says it is", () => {
  const justInside = quoteFromSnapshot(row({ last_tick_at: at(MAX_QUOTE_AGE_MS / 1000 - 1) }), NOW);
  assert.equal(justInside.origin, "live");
  const justOutside = quoteFromSnapshot(row({ last_tick_at: at(MAX_QUOTE_AGE_MS / 1000 + 1) }), NOW);
  assert.equal(justOutside.origin, "none");
});

check("a missing, partial or inverted quote is no quote", () => {
  // The trap here is real and was in this file once: Number(null) is 0 and
  // Number.isFinite(0) is true, so a null bid sails through as a price of
  // zero and fills an order at nothing.
  assert.equal(quoteFromSnapshot(null, NOW).origin, "none");
  assert.equal(quoteFromSnapshot(row({ last_bid: null }), NOW).origin, "none");
  assert.equal(quoteFromSnapshot(row({ last_ask: null }), NOW).origin, "none");
  assert.equal(quoteFromSnapshot(row({ last_bid: 0 }), NOW).origin, "none", "zero is not a price");
  assert.equal(quoteFromSnapshot(row({ last_bid: -5, last_ask: -4 }), NOW).origin, "none");
  const inverted = quoteFromSnapshot(row({ last_bid: 1900, last_ask: 1899 }), NOW);
  assert.equal(inverted.origin, "none");
  assert.ok(/inverted/.test(inverted.reason));
});

check("a price with no timestamp cannot be called fresh", () => {
  const r = quoteFromSnapshot(row({ last_tick_at: null }), NOW);
  assert.equal(r.origin, "none");
  assert.ok(/when this price was true/.test(r.reason), r.reason);
});

check("a timestamp from the future is clock skew, not a very fresh tick", () => {
  const r = quoteFromSnapshot(row({ last_tick_at: at(-600) }), NOW);
  assert.equal(r.origin, "none");
  assert.ok(/future/.test(r.reason), r.reason);
});

check("no feed never silently becomes the simulator", () => {
  // The caller must choose invented prices out loud. Falling back in here
  // would hide that decision at exactly the place it matters.
  const r = quoteFromSnapshot(null, NOW);
  assert.equal(r.origin, "none");
  assert.notEqual(r.origin, "simulated");
});

console.log("\nonly real prices count as evidence");

check("live counts, simulated does not, nothing does not", () => {
  assert.equal(countsAsEvidence("live"), true);
  assert.equal(countsAsEvidence("simulated"), false);
  assert.equal(countsAsEvidence("none"), false);
});

check("a simulated quote says so and stays saying so", () => {
  const r = simulatedQuote({ bid: 1899.5, ask: 1900 });
  assert.equal(r.origin, "simulated");
  assert.equal(countsAsEvidence(r.origin), false);
  assert.ok(/generated/.test(r.reason), r.reason);
});

console.log("\nthe line that reaches the journal");

check("a live fill says it counts; a simulated one says it does not", () => {
  const live = describeQuoteOrigin(quoteFromSnapshot(row(), NOW));
  assert.ok(/live broker spread/.test(live), live);
  assert.ok(/[Cc]ounts towards/.test(live), live);

  const sim = describeQuoteOrigin(simulatedQuote({ bid: 1, ask: 1.1 }));
  assert.ok(/[Dd]oes not count/.test(sim), sim);
  assert.ok(/not real/.test(sim), "say plainly why, not just that");
});

check("the journal line still makes sense months later", () => {
  // Nobody will remember which account this was. "Paper fill" alone does not
  // answer the question they will actually have: did this number mean
  // anything.
  for (const resolved of [
    quoteFromSnapshot(row(), NOW),
    simulatedQuote({ bid: 1, ask: 1.1 }),
    quoteFromSnapshot(null, NOW),
  ]) {
    const line = describeQuoteOrigin(resolved);
    assert.ok(line.length > 25, `too terse: "${line}"`);
    assert.ok(!/undefined|NaN|\[object/.test(line), `leaks internals: "${line}"`);
  }
});

check("a refusal explains itself rather than just saying no", () => {
  const line = describeQuoteOrigin(quoteFromSnapshot(row({ last_bid: null }), NOW));
  assert.ok(line.startsWith("No fill:"), line);
  assert.ok(line.length > "No fill:".length + 15, `give the reason: "${line}"`);
});

console.log(`\n${passed} checks passed`);
