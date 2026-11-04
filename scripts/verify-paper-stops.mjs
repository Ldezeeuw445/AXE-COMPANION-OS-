/**
 * Closing a practice position — and refusing to, when the price would make
 * the number meaningless.
 *
 * A stop that never fires is worse than no stop: the trader practises placing
 * them and learns that they do not matter. So the watcher exists. The risk in
 * writing one is the opposite error — closing a position against whatever
 * price happens to be around, which produces a P/L that looks real and is not.
 *
 * The rule most of this file defends: a position closes against the same kind
 * of price it opened on. A position filled at generated demo prices and closed
 * at a real broker tick yields the distance between an invented number and a
 * real one. That is not a profit or a loss, and it would land in the journal
 * looking exactly like one.
 *
 * Run: node scripts/verify-paper-stops.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  decideClose,
  mayJudgeWith,
  toBrokerTradeRow,
} from "../src/lib/trading/paperStopRules.ts";
import { evaluatePaperStops, openPaperPosition } from "../src/lib/trading/paperBroker.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const position = openPaperPosition({
  id: "11111111-2222-3333-4444-555555555555",
  symbol: "XAUUSD",
  side: "buy",
  volume: 0.1,
  quote: { bid: 1899.5, ask: 1900.0 },
  stopLoss: 1890,
  takeProfit: 1910,
  openedAt: "2026-10-28T12:00:00.000Z",
});
const hit = () => evaluatePaperStops(position, { bid: 1889.0, ask: 1889.5 });

console.log("a position is judged only against its own kind of price");

check("a simulated position is not closed against a real tick", () => {
  // The artefact this prevents: entry from a random walk, exit from the
  // market, and a P/L that is the gap between the two.
  const r = mayJudgeWith("simulated", "live");
  assert.equal(r.ok, false);
  assert.equal(r.skip, "origin-mismatch");
  assert.ok(/not be a profit or a loss/.test(r.detail), r.detail);
});

check("a live position is not closed against generated prices", () => {
  const r = mayJudgeWith("live", "simulated");
  assert.equal(r.ok, false);
  assert.equal(r.skip, "origin-mismatch");
});

check("matching origins are allowed", () => {
  assert.deepEqual(mayJudgeWith("live", "live"), { ok: true });
  assert.deepEqual(mayJudgeWith("simulated", "simulated"), { ok: true });
});

check("no price at all leaves the position open", () => {
  // Late is visible and arguable. A fill at a price that never existed is
  // neither, so a quiet feed must not close anything.
  const r = mayJudgeWith("live", "none");
  assert.equal(r.ok, false);
  assert.equal(r.skip, "no-price");
  assert.ok(/leaving the position open/.test(r.detail), r.detail);
});

console.log("\nthe decision the watcher acts on");

check("a reached stop on a matching price closes", () => {
  const d = decideClose(position, "live", "live", hit);
  assert.equal(d.act, true);
  assert.equal(d.close.reason, "stop-loss");
});

check("a mismatch does not close, even when the level was reached", () => {
  const d = decideClose(position, "simulated", "live", hit);
  assert.equal(d.act, false);
  assert.equal(d.skip, "origin-mismatch");
});

check("a position with no stop and no target is skipped before anything else", () => {
  const naked = { ...position, stopLoss: null, takeProfit: null };
  let evaluated = false;
  const d = decideClose(naked, "live", "live", () => {
    evaluated = true;
    return null;
  });
  assert.equal(d.act, false);
  assert.equal(d.skip, "no-stops");
  assert.equal(evaluated, false, "do not price a position that cannot close");
});

check("a level that was not reached is not a close", () => {
  const d = decideClose(position, "live", "live", () => null);
  assert.equal(d.act, false);
});

console.log("\nwhat reaches broker_trades");

check("the row is separable from broker fills, forever", () => {
  const row = toBrokerTradeRow({
    position,
    positionOrigin: "live",
    close: hit(),
    userId: "u1",
    accountId: "a1",
    closedAt: "2026-10-28T13:00:00.000Z",
  });
  assert.ok(String(row.external_trade_id).startsWith("paper:"), row.external_trade_id);
  assert.equal(row.raw.paper, true);
});

check("the row carries whether it counts as evidence", () => {
  // playbookEdge turns closed trades into claims about the trader. Without
  // this field a random walk becomes somebody's edge.
  const live = toBrokerTradeRow({
    position, positionOrigin: "live", close: hit(),
    userId: "u1", accountId: "a1", closedAt: "2026-10-28T13:00:00.000Z",
  });
  const sim = toBrokerTradeRow({
    position, positionOrigin: "simulated", close: hit(),
    userId: "u1", accountId: "a1", closedAt: "2026-10-28T13:00:00.000Z",
  });
  assert.equal(live.raw.counts_as_evidence, true);
  assert.equal(sim.raw.counts_as_evidence, false);
  assert.equal(sim.raw.quote_origin, "simulated");
});

check("the row reuses the position id, which is what makes the write idempotent", () => {
  // broker_trades has no unique constraint beyond its primary key — checked
  // against the live schema. A watcher that crashes after recording and
  // before deleting must retry into the same row, not create a second one.
  const row = toBrokerTradeRow({
    position, positionOrigin: "live", close: hit(),
    userId: "u1", accountId: "a1", closedAt: "2026-10-28T13:00:00.000Z",
  });
  assert.equal(row.id, position.id);

  const watcher = read("src/services/paperStopWatcher.ts");
  assert.ok(/onConflict: "id"/.test(watcher), "the upsert must key on that id");
});

check("the numbers a trader would check are all on the row", () => {
  const row = toBrokerTradeRow({
    position, positionOrigin: "live", close: hit(),
    userId: "u1", accountId: "a1", closedAt: "2026-10-28T13:00:00.000Z",
  });
  assert.equal(row.open_price, 1900.0, "the fill, across the spread");
  assert.equal(row.close_price, 1889.0, "the exit, across it again");
  assert.equal(row.pnl, -110, "and the loss that follows from both");
  assert.equal(row.raw.close_reason, "stop-loss");
  assert.equal(row.fees, 0);
});

console.log("\nthe sweep, and the cron that runs it");

check("the trade is written before the position is removed", () => {
  // The other order loses the trade entirely if the process dies between the
  // two writes.
  const watcher = read("src/services/paperStopWatcher.ts");
  const insert = watcher.indexOf('.from("broker_trades")');
  const remove = watcher.indexOf('.from("paper_positions")\n      .delete()');
  assert.ok(insert > 0 && remove > insert, "record the close, then delete");
});

check("one unreadable position does not stop the sweep", () => {
  const watcher = read("src/services/paperStopWatcher.ts");
  assert.ok(/summary\.errors\.push/.test(watcher));
  assert.ok(/continue;/.test(watcher), "keep going for everyone else");
});

check("the cron is secret-gated and needs no broker token", () => {
  const route = read("src/app/api/cron/paper-stops/route.ts");
  assert.ok(/CRON_SECRET/.test(route), "same gate as the other sweeps");
  assert.ok(
    !/getMetaApiToken/.test(route),
    "requiring a broker token would stop practice stops exactly where someone is practising",
  );
  assert.ok(/skipped/.test(route), "a run that skipped everything must look different from an empty one");
});

console.log(`\n${passed} checks passed`);
