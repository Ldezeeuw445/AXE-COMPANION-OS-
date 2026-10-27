/**
 * The conditions a trader actually makes money in — bouwlijst 3.4.
 *
 * `weakSpots` finds what is going wrong and says stop. Useful, and only ever a
 * brake. Luka asked for the other half: AXE that comes to you with something
 * of its own accord. So this names the trader's own edge back to them.
 *
 * The thing to guard here is the opposite of the usual one. Elsewhere in this
 * codebase the danger was an invented number on a screen; here it is an
 * invented *playbook*, which a trader would act on with money. So: a bucket
 * needs enough trades, it has to beat the trader's own baseline rather than
 * just be a slice of a profitable account, and every sentence has to stay a
 * statement about trades that already closed rather than a view on the market.
 *
 * Run: node scripts/verify-playbook-edge.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EDGE_MARGIN,
  MIN_EDGE_TRADES,
  MIN_TOTAL_TRADES,
  derivePlaybookEdges,
  edgeId,
  edgeNoticeParts,
  edgeOpenNow,
} from "../src/lib/journal/playbookEdge.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(p, "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let seq = 0;
/** A closed trade, entered at `hour` UTC. */
const trade = (symbol, side, pnl, hour) => ({
  id: `t${seq++}`,
  symbol,
  side,
  pnl,
  openTime: `2026-10-0${1 + (seq % 5)}T${String(hour).padStart(2, "0")}:30:00Z`,
});

/** n trades in one bucket, plus filler elsewhere so the baseline is low. */
function book({ bucket = 10, bucketPnl = 60, filler = 30, fillerPnl = 1 } = {}) {
  return [
    ...Array.from({ length: bucket }, () => trade("XAUUSD", "buy", bucketPnl, 9)),
    ...Array.from({ length: filler }, () => trade("EURUSD", "sell", fillerPnl, 14)),
  ];
}

console.log("minimum evidence");

check("an account with too little history has no playbook at all", () => {
  const thin = Array.from({ length: MIN_TOTAL_TRADES - 1 }, () => trade("XAUUSD", "buy", 80, 9));
  assert.deepEqual(derivePlaybookEdges(thin), [], "a good week is not a playbook");
});

check("a bucket below the floor is not reported however good it looks", () => {
  const edges = derivePlaybookEdges(book({ bucket: MIN_EDGE_TRADES - 1, bucketPnl: 500 }));
  assert.deepEqual(edges, [], `${MIN_EDGE_TRADES - 1} trades is noise, and noise named confidently is worse than silence`);
});

check("at the floor, with a real margin, it is reported", () => {
  const edges = derivePlaybookEdges(book({ bucket: MIN_EDGE_TRADES, bucketPnl: 60 }));
  assert.equal(edges.length, 1);
  assert.equal(edges[0].trades, MIN_EDGE_TRADES);
  assert.equal(edges[0].symbol, "XAUUSD");
  assert.equal(edges[0].session, "london");
  assert.equal(edges[0].direction, "long");
});

console.log("\nan edge has to be better than the trader's own average");

check("a slice of a uniformly profitable account is not an edge", () => {
  // Every trade makes +50. The XAUUSD London longs are not special, they are
  // just a subset. Without the baseline test, every profitable trader would be
  // told their best random slice is a playbook.
  const uniform = [
    ...Array.from({ length: 12 }, () => trade("XAUUSD", "buy", 50, 9)),
    ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", 50, 14)),
  ];
  assert.deepEqual(derivePlaybookEdges(uniform), []);
});

check("the margin is a multiple of the baseline, not a fixed amount", () => {
  // Same shape, two account sizes. "+15 a trade" means something different on
  // $5k than on $200k, so the test has to scale.
  const small = derivePlaybookEdges(book({ bucket: 10, bucketPnl: 30, fillerPnl: 1 }));
  const large = derivePlaybookEdges(book({ bucket: 10, bucketPnl: 3000, fillerPnl: 100 }));
  assert.equal(small.length, 1);
  assert.equal(large.length, 1);
  assert.ok(EDGE_MARGIN > 1);
});

check("a bucket just under the margin stays quiet", () => {
  // Baseline works out near 10; a bucket at 1.2x is better, not clearly better.
  const marginal = [
    ...Array.from({ length: 10 }, () => trade("XAUUSD", "buy", 12, 9)),
    ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", 10, 14)),
  ];
  assert.deepEqual(derivePlaybookEdges(marginal), [], "marginally better ground is not a playbook");
});

check("a losing bucket is weakSpots' job, not this one", () => {
  const losing = [
    ...Array.from({ length: 12 }, () => trade("XAUUSD", "buy", -40, 9)),
    ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", -5, 14)),
  ];
  assert.deepEqual(derivePlaybookEdges(losing), [], "this file never tells anyone a loss is an edge");
});

console.log("\nbuckets and their arithmetic");

check("a broker suffix does not split one instrument into four buckets", () => {
  const mixed = [
    ...Array.from({ length: 5 }, () => trade("XAUUSD", "buy", 60, 9)),
    ...Array.from({ length: 5 }, () => trade("xauusd.r", "buy", 60, 9)),
    ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", 1, 14)),
  ];
  const edges = derivePlaybookEdges(mixed);
  assert.equal(edges.length, 1, "ten trades on one instrument, not two buckets of five");
  assert.equal(edges[0].trades, 10);
});

check("long and short are different buckets, because they are different trades", () => {
  const both = [
    ...Array.from({ length: 10 }, () => trade("XAUUSD", "buy", 60, 9)),
    ...Array.from({ length: 10 }, () => trade("XAUUSD", "sell", 60, 9)),
    ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", 1, 14)),
  ];
  const ids = derivePlaybookEdges(both).map((e) => e.id).sort();
  assert.deepEqual(ids, [edgeId("XAUUSD", "london", "long"), edgeId("XAUUSD", "london", "short")].sort());
});

check("the session comes from the entry, and every spelling of a side is read", () => {
  for (const side of ["buy", "BUY", "Buy", "long", "0"]) {
    const edges = derivePlaybookEdges([
      ...Array.from({ length: 10 }, () => trade("XAUUSD", side, 60, 9)),
      ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", 1, 14)),
    ]);
    assert.equal(edges[0]?.direction, "long", `side "${side}" should read as long`);
  }
  for (const side of ["sell", "SELL", "short", "1"]) {
    const edges = derivePlaybookEdges([
      ...Array.from({ length: 10 }, () => trade("XAUUSD", side, 60, 9)),
      ...Array.from({ length: 20 }, () => trade("EURUSD", "buy", 1, 14)),
    ]);
    assert.equal(edges[0]?.direction, "short", `side "${side}" should read as short`);
  }
});

check("a trade with no entry time or an unreadable side is skipped, not guessed", () => {
  const edges = derivePlaybookEdges([
    ...Array.from({ length: 10 }, () => ({ ...trade("XAUUSD", "buy", 60, 9), openTime: null })),
    ...Array.from({ length: 10 }, () => trade("XAUUSD", "wat", 60, 9)),
    ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", 1, 14)),
  ]);
  assert.deepEqual(edges, [], "20 unusable trades leave too little history to claim anything");
});

check("the numbers in the evidence are the numbers in the fields", () => {
  const edges = derivePlaybookEdges([
    ...Array.from({ length: 8 }, () => trade("XAUUSD", "buy", 100, 9)),
    ...Array.from({ length: 2 }, () => trade("XAUUSD", "buy", -20, 9)),
    ...Array.from({ length: 20 }, () => trade("EURUSD", "sell", 1, 14)),
  ]);
  const e = edges[0];
  assert.equal(e.trades, 10);
  assert.equal(e.wins, 8);
  assert.equal(Math.round(e.winRate * 100), 80);
  assert.equal(e.netPnl, 760);
  assert.equal(e.perTrade, 76);
  assert.match(e.evidence, /8 of 10 won/);
  assert.match(e.evidence, /\+76\.00 each/);
  assert.match(e.evidence, /10 London XAUUSD longs/);
  // The baseline is in the sentence too, because "+76 each" means nothing
  // without what the trader averages everywhere else.
  assert.match(e.evidence, /against \+/);
});

check("strength needs both a margin and a sample, not one of the two", () => {
  const fewButWild = derivePlaybookEdges(book({ bucket: MIN_EDGE_TRADES, bucketPnl: 5000 }));
  const manyAndSolid = derivePlaybookEdges(book({ bucket: 25, bucketPnl: 60 }));
  assert.ok(fewButWild[0].strength < 0.5, "eight spectacular trades are not a playbook");
  assert.ok(manyAndSolid[0].strength > fewButWild[0].strength);
  for (const e of [...fewButWild, ...manyAndSolid]) {
    assert.ok(e.strength >= 0 && e.strength <= 1, `strength out of range: ${e.strength}`);
  }
});

check("the strongest edge is first", () => {
  const edges = derivePlaybookEdges([
    ...Array.from({ length: 25 }, () => trade("XAUUSD", "buy", 60, 9)),
    ...Array.from({ length: 9 }, () => trade("GBPJPY", "buy", 70, 9)),
    ...Array.from({ length: 30 }, () => trade("EURUSD", "sell", 1, 14)),
  ]);
  assert.equal(edges[0].symbol, "XAUUSD", "more evidence wins over a slightly better average");
});

console.log("\nonly while the trader is standing in it");

const londonEdge = () => derivePlaybookEdges(book({ bucket: 25, bucketPnl: 60 }));

check("an edge is only raised when its own session is open", () => {
  const edges = londonEdge();
  assert.ok(edgeOpenNow(edges, new Date("2026-10-27T09:00:00Z")), "London window");
  assert.equal(edgeOpenNow(edges, new Date("2026-10-27T15:00:00Z")), null, "New York hours");
  assert.equal(edgeOpenNow(edges, new Date("2026-10-27T02:00:00Z")), null, "Asia hours");
});

check("an instrument they are not watching today is not worth a notification", () => {
  const edges = londonEdge();
  const t = new Date("2026-10-27T09:00:00Z");
  assert.ok(edgeOpenNow(edges, t, ["XAUUSD", "EURUSD"]), "on their chart list");
  assert.equal(edgeOpenNow(edges, t, ["BTCUSD"]), null, "not on it");
  assert.ok(edgeOpenNow(edges, t, []), "an empty list means no filter, for a trader with no saved charts");
  assert.ok(edgeOpenNow(edges, t, ["xauusd.r"]), "and the suffix must not break the match");
});

check("a weak edge does not interrupt anyone", () => {
  const weak = derivePlaybookEdges(book({ bucket: MIN_EDGE_TRADES, bucketPnl: 5000 }));
  assert.ok(weak[0].strength < 0.25);
  assert.equal(edgeOpenNow(weak, new Date("2026-10-27T09:00:00Z")), null);
});

console.log("\nit stays a statement about the trader");

check("the notice is the trader's own record, not a view on the market", () => {
  const parts = edgeNoticeParts(londonEdge()[0]);
  assert.match(parts.soWhat, /not a view on today's market/);
  assert.match(parts.soWhat, /your own record/);
  // A signal wearing a statistic as a disguise is the one thing this must
  // never produce, so the words that would make it one are banned outright.
  const all = `${parts.title} ${parts.what} ${parts.soWhat}`.toLowerCase();
  for (const word of ["buy now", "sell now", "entry here", "take the trade", "setup is valid", "looks long", "looks short"]) {
    assert.ok(!all.includes(word), `"${word}" turns a measurement into a signal`);
  }
  assert.match(parts.soWhat, /check whether the setup you normally take is actually there/);
});

check("it says which window and which instrument, in the title", () => {
  const parts = edgeNoticeParts(londonEdge()[0]);
  assert.match(parts.title, /London/);
  assert.match(parts.title, /XAUUSD/);
});

console.log("\nwiring");

const watcher = read("src/services/axeProactiveWatcher.ts");
const watcherCode = codeOnly(watcher);

check("the watcher raises it, through the one notice path", () => {
  assert.ok(/derivePlaybookEdges\(edgeTrades\)/.test(watcherCode));
  assert.ok(/edgeOpenNow\(edges, new Date\(\), setup\.symbols\)/.test(watcherCode));
  assert.ok(/playbook_edge:\$\{edge\.id\}/.test(watcher), "keyed per edge per day");
  assert.ok(/See those \$\{edge\.trades\} trades/.test(watcher), "and it names the evidence to go and read");
});

check("one trade load feeds both halves", () => {
  // weakSpots and this read the same rows; two queries for the same 300
  // trades would be waste on a cron that runs every fifteen minutes.
  assert.equal(
    (watcherCode.match(/loadWeakSpotTrades\(supabase, userId, accountId\)/g) ?? []).length,
    1,
  );
  assert.ok(/detectWeakSpots\(edgeTrades\)/.test(watcherCode));
});

check("it never brings the watcher down", () => {
  const block = watcherCode.slice(watcherCode.indexOf("derivePlaybookEdges"));
  assert.ok(/catch \{/.test(block), "an extra, never a reason the watcher fails");
});

console.log(`\n${passed} checks passed`);
