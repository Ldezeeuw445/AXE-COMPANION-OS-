/**
 * Verification for src/lib/journal/weakSpots.ts
 *
 * Each case builds a trade history with one deliberate flaw and asserts that
 * AXE names it — and, just as important, that a clean history produces silence.
 * A detector that always finds something is worth nothing.
 *
 * Run: node scripts/verify-weak-spots.mjs
 */
import assert from "node:assert/strict";
import { detectWeakSpots, weakSpotHeadline } from "../src/lib/journal/weakSpots.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const DAY = 24 * 60 * 60 * 1000;
const base = Date.UTC(2026, 8, 1, 9, 0, 0);

/** Build a trade. `at` is minutes from a fixed origin; `hold` is minutes. */
function trade(i, { at, hold, pnl, symbol = "XAUUSD", volume = 0.5, side = "buy" }) {
  const open = base + at * 60000;
  return {
    id: `t${i}`,
    symbol,
    side,
    volume,
    pnl,
    openTime: new Date(open).toISOString(),
    closeTime: new Date(open + hold * 60000).toISOString(),
  };
}

console.log("weakSpots");

check("too little history says nothing at all", () => {
  const few = Array.from({ length: 8 }, (_, i) =>
    trade(i, { at: i * 600, hold: 30, pnl: i % 2 ? 40 : -90 }),
  );
  assert.deepEqual(detectWeakSpots(few), []);
  assert.equal(weakSpotHeadline([]), null);
});

check("a balanced history produces no findings", () => {
  // Deliberately uncorrelated: hold time, size, symbol, session and day all say
  // nothing about the outcome. Short trades win as often as they lose, size is
  // constant, both symbols are net positive, one trade a day in one session.
  // An earlier version of this fixture tied every short hold to a loss — the
  // detector flagged it, correctly, and the fixture was the thing that was wrong.
  const HOLD = [30, 150, 30, 150];
  const PNL = [60, -40, -40, 60];
  const clean = Array.from({ length: 24 }, (_, i) =>
    trade(i, {
      at: i * 1440, // one trade a day, same hour
      hold: HOLD[i % 4],
      pnl: PNL[i % 4],
      symbol: i % 2 ? "XAUUSD" : "EURUSD",
    }),
  );
  const spots = detectWeakSpots(clean);
  assert.deepEqual(spots, [], `expected silence, got: ${spots.map((s) => s.id).join(", ")}`);
});

check("holding losers longer than winners is named with both medians", () => {
  const trades = [];
  for (let i = 0; i < 10; i += 1) trades.push(trade(i, { at: i * 600, hold: 20, pnl: 50 }));
  for (let i = 10; i < 20; i += 1) trades.push(trade(i, { at: i * 600, hold: 180, pnl: -60 }));
  const spots = detectWeakSpots(trades);
  const spot = spots.find((s) => s.id === "cutting_winners");
  assert.ok(spot, "did not detect the asymmetry");
  assert.match(spot.evidence, /20 min/);
  assert.match(spot.evidence, /9\.0× as long/); // 180 min losers vs 20 min winners
  assert.ok(spot.proposal.length > 40, "a proposal must be actionable, not a slogan");
});

check("revenge trades after a loss are separated from the rest", () => {
  const trades = [];
  let at = 0;
  for (let i = 0; i < 8; i += 1) {
    // a loser, then a trade opened five minutes after it closed
    trades.push(trade(i * 2, { at, hold: 30, pnl: -70 }));
    trades.push(trade(i * 2 + 1, { at: at + 35, hold: 30, pnl: -120 }));
    at += 600;
  }
  // calm trades, far from any loss
  for (let i = 0; i < 8; i += 1) trades.push(trade(100 + i, { at: at + i * 600, hold: 45, pnl: 90 }));

  const spot = detectWeakSpots(trades).find((s) => s.id === "revenge_trading");
  assert.ok(spot, "did not detect revenge trading");
  assert.match(spot.evidence, /within 15 minutes/);
  assert.match(spot.proposal, /cooldown/);
});

check("sizing up after a loss is caught with the percentage", () => {
  const trades = [];
  let at = 0;
  for (let i = 0; i < 10; i += 1) {
    trades.push(trade(i * 2, { at, hold: 60, pnl: -50, volume: 0.5 }));
    trades.push(trade(i * 2 + 1, { at: at + 300, hold: 60, pnl: 20, volume: 1.5 }));
    at += 900;
  }
  const spot = detectWeakSpots(trades).find((s) => s.id === "size_escalation");
  assert.ok(spot, "did not detect size escalation");
  assert.match(spot.evidence, /200% bigger/);
});

check("one symbol doing the damage is named", () => {
  const trades = [];
  for (let i = 0; i < 10; i += 1)
    trades.push(trade(i, { at: i * 600, hold: 60, pnl: 40, symbol: "EURUSD" }));
  for (let i = 10; i < 18; i += 1)
    trades.push(trade(i, { at: i * 600, hold: 60, pnl: -120, symbol: "BTCUSD" }));
  const spot = detectWeakSpots(trades).find((s) => s.id === "bleeding_symbol");
  assert.ok(spot, "did not detect the bleeding symbol");
  assert.match(spot.title, /BTCUSD/);
  assert.match(spot.evidence, /-960\.00/);
});

check("findings come back worst-first and capped", () => {
  const trades = [];
  let at = 0;
  for (let i = 0; i < 12; i += 1) {
    trades.push(trade(i * 2, { at, hold: 15, pnl: -150, volume: 0.5, symbol: "BTCUSD" }));
    trades.push(trade(i * 2 + 1, { at: at + 20, hold: 400, pnl: -200, volume: 2, symbol: "BTCUSD" }));
    at += 700;
  }
  const spots = detectWeakSpots(trades, { limit: 2 });
  assert.ok(spots.length <= 2, "limit ignored");
  for (let i = 1; i < spots.length; i += 1) {
    assert.ok(spots[i - 1].severity >= spots[i].severity, "not sorted by severity");
  }
});

check("a headline carries the number, not just the verdict", () => {
  const trades = [];
  for (let i = 0; i < 10; i += 1) trades.push(trade(i, { at: i * 600, hold: 20, pnl: 50 }));
  for (let i = 10; i < 20; i += 1) trades.push(trade(i, { at: i * 600, hold: 180, pnl: -60 }));
  const headline = weakSpotHeadline(detectWeakSpots(trades));
  assert.ok(headline);
  assert.match(headline, /\d/, "a headline without a number is an opinion");
});

check("trades missing timestamps are skipped, not counted as zero", () => {
  const trades = Array.from({ length: 20 }, (_, i) => ({
    id: `x${i}`,
    symbol: "XAUUSD",
    side: "buy",
    volume: 0.5,
    pnl: i % 2 ? 50 : -50,
    openTime: null,
    closeTime: null,
  }));
  // No timing data at all → timing checks must stay quiet rather than invent
  // a zero-minute hold for everything.
  const ids = detectWeakSpots(trades).map((s) => s.id);
  assert.ok(!ids.includes("cutting_winners"));
  assert.ok(!ids.includes("fast_losses"));
  assert.ok(!ids.includes("revenge_trading"));
});

console.log(`\n${passed} checks passed`);
