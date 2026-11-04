/**
 * Paper trading that does not flatter you.
 *
 * Build-list item 10 asks for an account you can practise on without money,
 * so the journal and the learning arc run on real behaviour. The risk in
 * building one is not that it breaks — it is that it is too kind, and a
 * trader learns a habit that costs them the day they fund an account.
 *
 * So almost every check below asserts that the simulator is *worse* than the
 * naive version: it crosses the spread twice, it measures stops against the
 * side you would really exit on, it does not pay out a stop that gapped, and
 * when one quote reaches both the stop and the target it takes the stop.
 *
 * Run: node scripts/verify-paper-broker.mjs
 */
import assert from "node:assert/strict";

import {
  PAPER_LIMITS,
  closeFillPrice,
  closePaperPosition,
  evaluatePaperStops,
  fillPrice,
  markToMarket,
  openPaperPosition,
  paperOrderRejections,
  paperPnl,
  evaluatePaperStopsOnBar,
} from "../src/lib/trading/paperBroker.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const quote = (bid, ask) => ({ bid, ask });
const GOLD = quote(1899.5, 1900.0); // 50 cent spread, realistic for XAUUSD

const openArgs = (over = {}) => ({
  id: "p1",
  symbol: "XAUUSD",
  side: "buy",
  volume: 0.1,
  quote: GOLD,
  stopLoss: null,
  takeProfit: null,
  openedAt: "2026-10-28T12:00:00.000Z",
  ...over,
});

console.log("you cross the spread, both ways");

check("a buy fills at the ask and a sell at the bid", () => {
  assert.equal(fillPrice("buy", GOLD), 1900.0);
  assert.equal(fillPrice("sell", GOLD), 1899.5);
});

check("closing crosses back the other way", () => {
  assert.equal(closeFillPrice("buy", GOLD), 1899.5, "a long sells into the bid");
  assert.equal(closeFillPrice("sell", GOLD), 1900.0, "a short buys back at the ask");
});

check("a position opened and closed at an unchanged market loses the spread", () => {
  // This is the whole point. A simulator that fills both sides at the mid
  // reports break-even here, and every scalping idea looks one spread better
  // than it is.
  const pos = openPaperPosition(openArgs());
  const closed = closePaperPosition(pos, GOLD);
  assert.ok(closed.pnl < 0, `an untouched market must still cost the spread, got ${closed.pnl}`);
  // 0.50 of price × 100 per lot × 0.1 lot = 5.00
  assert.equal(closed.pnl, -5);
});

check("the same is true for a short", () => {
  const pos = openPaperPosition(openArgs({ side: "sell" }));
  assert.equal(closePaperPosition(pos, GOLD).pnl, -5);
});

console.log("\nprofit and loss, the way a statement reads");

check("a long that moves in your favour pays out the move, less the spread", () => {
  const pos = openPaperPosition(openArgs()); // filled at 1900.00
  const later = quote(1910.0, 1910.5);
  // Exits on the bid at 1910.00 → 10.00 × 100 × 0.1 = 100.00
  assert.equal(markToMarket(pos, later), 100);
});

check("a short profits when price falls", () => {
  const pos = openPaperPosition(openArgs({ side: "sell" })); // filled at 1899.50
  const later = quote(1889.0, 1889.5);
  // Buys back at the ask 1889.50 → (1899.50 - 1889.50) × 100 × 0.1 = 100.00
  assert.equal(markToMarket(pos, later), 100);
});

check("the instrument decides the money, not the price difference", () => {
  // 10 points on gold is not 10 points on EURUSD, and a simulator that treats
  // them alike teaches position sizing that is wrong by orders of magnitude.
  const gold = openPaperPosition(openArgs({ symbol: "XAUUSD", volume: 1 }));
  const fx = openPaperPosition(openArgs({ symbol: "EURUSD", volume: 1, quote: quote(1.0, 1.0) }));
  assert.equal(paperPnl(gold, gold.openPrice + 1), 100, "1.00 on gold at 1 lot is 100");
  assert.equal(paperPnl(fx, fx.openPrice + 0.0001), 10, "a pip of EURUSD at 1 lot is 10");
});

check("money is rounded like a broker statement", () => {
  // 1900.1 - 1900.0 is 0.09999999999990905 in IEEE 754, so the raw product is
  // 0.9999999999990905. Without rounding that lands in the journal, every sum
  // over it drifts, and a P/L column shows numbers no broker would print.
  const pos = openPaperPosition(openArgs({ quote: quote(1899.5, 1900.0) }));
  assert.equal(1900.1 - 1900.0 === 0.1, false, "the raw subtraction really is inexact");
  assert.equal(paperPnl(pos, 1900.1), 1, "no floating-point tail into the journal");
  assert.equal(paperPnl(pos, 1900.123), 1.23, "two decimals, no more");
});

console.log("\nstops are instructions, not promises");

check("a long's stop is measured against the bid, not the mid", () => {
  const pos = openPaperPosition(openArgs({ stopLoss: 1890 }));
  // Bid exactly on the stop: hit. Measuring on the ask here would survive it.
  assert.equal(evaluatePaperStops(pos, quote(1890.0, 1890.5))?.reason, "stop-loss");
  assert.equal(evaluatePaperStops(pos, quote(1890.5, 1891.0)), null, "above the stop, still open");
});

check("a gap through the stop fills at the gap, not at the stop", () => {
  // The belief this prevents: "my stop caps my loss at exactly X". It does
  // not, and the first weekend gap is an expensive place to learn that.
  const pos = openPaperPosition(openArgs({ stopLoss: 1890 }));
  const closed = evaluatePaperStops(pos, quote(1870.0, 1870.5));
  assert.equal(closed.reason, "stop-loss");
  assert.equal(closed.price, 1870.0, "filled where the market actually was");
  assert.equal(closed.gapped, true, "and the trader is told it gapped");
  assert.equal(closed.pnl, -300, "1900 → 1870 at 0.1 lot on gold");
});

check("a target does not pay out more than it asked for", () => {
  // The mirror of the gap rule. Granting the better price would be a gift the
  // same model refuses when it goes against you.
  const pos = openPaperPosition(openArgs({ takeProfit: 1910 }));
  const closed = evaluatePaperStops(pos, quote(1925.0, 1925.5));
  assert.equal(closed.reason, "take-profit");
  assert.equal(closed.price, 1910, "filled at the target, not at the gap");
  assert.equal(closed.gapped, true);
});

check("one quote can only ever reach one of the two", () => {
  // Worth stating, because it is why the rule below needs a bar. A long
  // always exits on the bid, so no single quote reaches the stop and the
  // target at once — a check that claims to test that ordering here would be
  // testing something that cannot happen.
  const pos = openPaperPosition(openArgs({ stopLoss: 1890, takeProfit: 1910 }));
  assert.equal(evaluatePaperStops(pos, quote(1880.0, 1915.0)).reason, "stop-loss");
  assert.equal(evaluatePaperStops(pos, quote(1915.0, 1915.5)).reason, "take-profit");
});

check("a bar that touched both takes the stop", () => {
  // Here the ordering is real: the bar's low reached the stop and its high
  // reached the target, and nothing in the data says which came first. The
  // simulator assumes the worse order. A strategy that still looks good under
  // that assumption is one you can trust with money.
  const pos = openPaperPosition(openArgs({ stopLoss: 1890, takeProfit: 1910 }));
  const bar = { high: 1915, low: 1885 };
  const closed = evaluatePaperStopsOnBar(pos, bar);
  assert.equal(closed.reason, "stop-loss", "resolving its own ignorance in your favour is the lie");
  assert.equal(closed.price, 1890, "filled at the stop — the bar traded through it, not gapped past");
});

check("a bar that only reached the target pays the target", () => {
  const pos = openPaperPosition(openArgs({ stopLoss: 1890, takeProfit: 1910 }));
  const closed = evaluatePaperStopsOnBar(pos, { high: 1915, low: 1895 });
  assert.equal(closed.reason, "take-profit");
  assert.equal(closed.price, 1910);
});

check("a bar that touched neither leaves the position open", () => {
  const pos = openPaperPosition(openArgs({ stopLoss: 1890, takeProfit: 1910 }));
  assert.equal(evaluatePaperStopsOnBar(pos, { high: 1905, low: 1895 }), null);
});

check("a short's bar is measured on the ask side", () => {
  // A short exits by buying, so the spread works against it at the high.
  const pos = openPaperPosition(openArgs({ side: "sell", stopLoss: 1910, takeProfit: 1880 }));
  const closed = evaluatePaperStopsOnBar(pos, { high: 1909.8, low: 1900, spread: 0.5 });
  assert.equal(closed.reason, "stop-loss", "1909.8 + 0.5 spread crosses the 1910 stop");
});

check("a nonsense bar closes nothing rather than guessing", () => {
  const pos = openPaperPosition(openArgs({ stopLoss: 1890 }));
  assert.equal(evaluatePaperStopsOnBar(pos, { high: 1880, low: 1920 }), null, "high below low");
  assert.equal(evaluatePaperStopsOnBar(pos, { high: Number.NaN, low: 1880 }), null);
});

check("a short's stop is measured against the ask", () => {
  const pos = openPaperPosition(openArgs({ side: "sell", stopLoss: 1910 }));
  assert.equal(evaluatePaperStops(pos, quote(1909.5, 1910.0))?.reason, "stop-loss");
  assert.equal(evaluatePaperStops(pos, quote(1909.0, 1909.5)), null);
});

check("a position with no stops never closes itself", () => {
  const pos = openPaperPosition(openArgs());
  assert.equal(evaluatePaperStops(pos, quote(1.0, 1.5)), null);
  assert.equal(evaluatePaperStops(pos, quote(99999, 99999.5)), null);
});

console.log("\nwhat it refuses to open");

check("an order needs a real quote", () => {
  const reasons = paperOrderRejections(openArgs({ quote: quote(Number.NaN, Number.NaN) }));
  assert.ok(reasons.some((r) => /live quote/.test(r)), JSON.stringify(reasons));
});

check("an inverted quote is refused rather than silently traded", () => {
  const reasons = paperOrderRejections(openArgs({ quote: quote(1900, 1899) }));
  assert.ok(reasons.some((r) => /inverted/.test(r)), JSON.stringify(reasons));
});

check("zero or negative volume is refused", () => {
  assert.ok(paperOrderRejections(openArgs({ volume: 0 })).length > 0);
  assert.ok(paperOrderRejections(openArgs({ volume: -1 })).length > 0);
});

check("a stop on the wrong side of the entry is a typo, and is refused", () => {
  // It would trigger on the next tick. A broker rejects it; so does this.
  const long = paperOrderRejections(openArgs({ stopLoss: 1950 }));
  assert.ok(long.some((r) => /wrong side/.test(r)), JSON.stringify(long));

  const short = paperOrderRejections(openArgs({ side: "sell", takeProfit: 1950 }));
  assert.ok(short.some((r) => /wrong side/.test(r)), JSON.stringify(short));

  assert.deepEqual(paperOrderRejections(openArgs({ stopLoss: 1890, takeProfit: 1920 })), []);
});

console.log("\nit admits what it does not model");

check("the limits are stated, and every one of them flatters paper", () => {
  assert.ok(PAPER_LIMITS.length >= 4);
  const all = PAPER_LIMITS.join(" ").toLowerCase();
  for (const word of ["swap", "commission", "slippage", "margin call"]) {
    assert.ok(all.includes(word), `${word} is a real cost paper skips — say so`);
  }
  for (const limit of PAPER_LIMITS) {
    assert.ok(limit.length > 40, `too terse to be useful: "${limit}"`);
  }
});

console.log(`\n${passed} checks passed`);
