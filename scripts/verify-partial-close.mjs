/**
 * Taking half off — and the remainder nobody thinks about.
 *
 * Build-list item 11. Closing part of a position is the most common thing a
 * trader does after a winning move, and `close-position` could only close all
 * of it. The arithmetic is trivial; the remainder is not.
 *
 * Close 0.095 of a 0.10 position and the 0.005 left behind is below any
 * broker's minimum. The trader is then holding something they cannot close,
 * modify or add to. MT5 rejects it, and the worst version of this feature
 * accepts the request and surfaces that rejection as a generic broker error
 * three seconds later, with nothing the trader can do about it.
 *
 * Run: node scripts/verify-partial-close.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MIN_LOT, decidePartialClose } from "../src/lib/trading/partialClose.ts";
import { closePaperPositionById } from "../src/services/paperOrderService.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const at = (positionVolume, requested) => decidePartialClose({ positionVolume, requested });

/** Default rules are step 0.01 and minimum 0.01; some checks need them apart. */

console.log("the ordinary case: half off, the rest runs");

check("half of a round position is a partial with a usable remainder", () => {
  assert.deepEqual(at(1.0, 0.5), { kind: "partial", volume: 0.5, remainder: 0.5 });
  assert.deepEqual(at(0.1, 0.05), { kind: "partial", volume: 0.05, remainder: 0.05 });
});

check("closing everything is reported as a full close, not a partial", () => {
  // The caller then takes the simpler path instead of asking a broker to
  // close "all of it" by volume, which is the same thing stated less clearly.
  assert.deepEqual(at(0.1, 0.1), { kind: "full", volume: 0.1 });
  assert.deepEqual(at(2, 2), { kind: "full", volume: 2 });
});

check("lot sizes reach the trader rounded, not as float noise", () => {
  // Measured across 500 lot steps: 62 of them drift. 35 * 0.01 is
  // 0.35000000000000003 and 47 * 0.01 is 0.47000000000000003. Both end up in
  // front of the trader and in the comparison against the broker minimum.
  //
  // The first version of this check used 0.3 - 0.1, which happens to come out
  // clean through this code path — so removing the rounding did not break it.
  // A check that passes against the broken version is not a check.
  assert.equal(35 * 0.01 === 0.35, false, "this step really does drift");
  assert.equal(47 * 0.01 === 0.47, false, "and so does this one");

  const d = at(0.85, 0.5);
  assert.equal(d.kind, "partial");
  assert.equal(d.remainder, 0.35, `remainder read as ${d.remainder}`);
  assert.equal(String(d.remainder), "0.35", "and prints cleanly");

  const e = at(0.6, 0.47);
  assert.equal(e.volume, 0.47, `volume read as ${e.volume}`);
  assert.equal(String(e.volume), "0.47");

  const f = at(0.1, 0.09);
  assert.equal(f.kind, "partial", "a 0.01 remainder is exactly the minimum, so it is allowed");
  assert.equal(f.remainder, 0.01, "and must read as 0.01, not 0.010000000000000009");
});

console.log("\nthe remainder nobody thinks about");

check("a remainder below the minimum is refused, with both ways out", () => {
  // Only reachable where the broker's minimum order is larger than its lot
  // step — step 0.01, minimum 0.10, which real brokers do. While the two are
  // the same number a remainder can only be zero or at least the minimum, so
  // testing this against the defaults would be testing a branch that cannot
  // fire. That was the mistake the first version of this check made.
  const wide = { minLot: 0.1, lotStep: 0.01 };
  const d = decidePartialClose({ positionVolume: 1.0, requested: 0.95 }, wide);
  assert.equal(d.kind, "rejected");
  assert.ok(/below the 0.1 minimum/.test(d.reason), d.reason);
  // The two things the trader can actually do next, and no third option.
  assert.ok(/close the position/.test(d.reason), "either take it all");
  assert.ok(/at most 0.9 lots/.test(d.reason), "or take less — and say how much");

  // And the boundary that message points at must itself be accepted.
  const ok = decidePartialClose({ positionVolume: 1.0, requested: 0.9 }, wide);
  assert.equal(ok.kind, "partial");
  assert.equal(ok.remainder, 0.1);
});

check("a position too small to split says so, instead of offering a number", () => {
  const wide = { minLot: 0.1, lotStep: 0.01 };
  const d = decidePartialClose({ positionVolume: 0.15, requested: 0.1 }, wide);
  assert.equal(d.kind, "rejected");
  assert.ok(/cannot be split/.test(d.reason), d.reason);
  assert.ok(!/at most/.test(d.reason), "do not offer a partial that does not exist");
});

check("a size that is not a whole lot step is refused, never rounded into one", () => {
  // The bug this caught: toSteps(0.005) is Math.round(0.5), which is 1. So a
  // request for half the minimum silently became a request for the minimum —
  // and on a 0.01 position that is the entire thing. The trader asks to take
  // a sliver off and the position closes.
  const d = at(MIN_LOT, 0.005);
  assert.equal(d.kind, "rejected", "0.005 must never become 0.01");
  assert.ok(/not a whole step/.test(d.reason), d.reason);

  for (const odd of [0.015, 0.123, 0.0001]) {
    assert.equal(at(1.0, odd).kind, "rejected", `${odd} is not on a lot step`);
  }
});

check("the smallest position cannot be split at all, and says so plainly", () => {
  // 0.01 is on a step, so it gets past the step check and must then be caught
  // by the remainder rule rather than closing the position by accident.
  const d = at(MIN_LOT, 0.01);
  assert.equal(d.kind, "full", "asking for all of the minimum is a full close");

  const e = at(0.02, 0.015);
  assert.equal(e.kind, "rejected");
  assert.ok(/not a whole step/.test(e.reason), e.reason);
});

check("a request below the broker minimum is refused before anything is sent", () => {
  // Needs a broker whose minimum is above its step, or the step rule catches
  // it first and this says nothing about the minimum.
  const wide = { minLot: 0.1, lotStep: 0.01 };
  const d = decidePartialClose({ positionVolume: 1.0, requested: 0.05 }, wide);
  assert.equal(d.kind, "rejected");
  assert.ok(/smallest a broker will take is 0.1/.test(d.reason), d.reason);
});

check("exactly the largest valid partial is allowed", () => {
  // The boundary the rejection message points at must itself be accepted, or
  // the advice sends the trader into a second rejection.
  const d = at(0.1, 0.09);
  assert.deepEqual(d, { kind: "partial", volume: 0.09, remainder: 0.01 });
});

console.log("\nnonsense is refused, not sent to a broker");

check("more than the position holds is refused, naming both numbers", () => {
  const d = at(0.1, 0.5);
  assert.equal(d.kind, "rejected");
  assert.ok(/0\.5 lots but the position is 0\.1/.test(d.reason), d.reason);
});

check("zero, negative and non-numeric are refused", () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(at(1.0, bad).kind, "rejected", `requested ${bad} should be refused`);
  }
  for (const bad of [0, -1, Number.NaN]) {
    assert.equal(at(bad, 0.5).kind, "rejected", `a position of ${bad} should be refused`);
  }
});

check("a rejection always explains itself in the trader's units", () => {
  for (const [total, want] of [[0.1, 0.095], [1.0, 0.005], [0.1, 0.5], [0.01, 0.005]]) {
    const d = at(total, want);
    assert.equal(d.kind, "rejected");
    assert.ok(d.reason.length > 25, `too terse: "${d.reason}"`);
    assert.ok(!/undefined|NaN|\[object/.test(d.reason), `leaks internals: "${d.reason}"`);
  }
});

console.log("\nwired through to the broker and to paper");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * Just enough of the Supabase client for `closePaperPositionById`, recording
 * every table write so a check can assert on what happened rather than on
 * what the source says.
 */
function makeSupabaseStub(calls, positionRow) {
  const builder = (table, op, payload) => {
    const rec = { table, op, payload, filters: {} };
    if (op !== "select") calls.push(rec);
    const chain = {
      eq(col, val) {
        rec.filters[col] = val;
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({
          data: table === "paper_positions" && op === "select" ? positionRow : null,
          error: null,
        });
      },
      then(resolve) {
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  };

  return {
    from(table) {
      return {
        select: () => builder(table, "select"),
        update: (payload) => builder(table, "update", payload),
        delete: () => builder(table, "delete"),
        upsert: (payload) => builder(table, "upsert", payload),
        insert: (payload) => builder(table, "insert", payload),
      };
    },
  };
}

/** Same as `check`, for the two cases that exercise the async service. */
async function acheck(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}
const client = read("src/lib/mt5/metaApiClient.ts");
const route = read("src/app/api/mt5/close-position/route.ts");
const paper = read("src/services/paperOrderService.ts");

check("the MetaApi call carries a volume, and omits the key for a full close", () => {
  // A present `volume` is what makes it a partial close. Sending null is a
  // different request from sending no key, so the key is added conditionally.
  assert.ok(/volume\?: number \| null/.test(client), "the input type takes it");
  assert.ok(/body\.volume = input\.volume/.test(client), "and it reaches the request body");
  assert.ok(
    /if \(input\.volume != null && Number\.isFinite\(input\.volume\) && input\.volume > 0\)/.test(client),
    "only when it is a real size",
  );
});

check("the route checks what it can before spending a round trip", () => {
  assert.ok(/rejectRequestedVolume\(/.test(route), "off-step and under-minimum are caught here");
  assert.ok(/invalid_volume/.test(route), "and answered as a bad request, not a broker error");
  const idx = route.indexOf("rejectRequestedVolume(");
  const lookup = route.indexOf('.from("user_broker_accounts")');
  assert.ok(idx < lookup, "before the account lookup, so a typo costs nothing");
});

await acheck("closing part of a practice position leaves the rest open — really", async () => {
  // The one check in this file that exercises behaviour instead of reading
  // source. It exists because the source-reading version passed against a
  // mutation that deleted the whole position on a partial close: the text it
  // searched for was still there, the branch that used it was not.
  //
  // That is the most expensive failure this feature has. A trader takes half
  // off, the position disappears, and the rest of the move happens without
  // them.
  const calls = [];
  const stub = makeSupabaseStub(calls, {
    id: "pos-1",
    account_id: "acc-1",
    symbol: "XAUUSD",
    side: "buy",
    volume: 0.1,
    open_price: 1900,
    stop_loss: null,
    take_profit: null,
    opened_at: "2026-10-29T10:00:00.000Z",
    quote_origin: "simulated",
  });

  const result = await closePaperPositionById(stub, "user-1", "pos-1", 0.04);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.volume, 0.04, "it closed what was asked");
  assert.equal(result.remaining, 0.06, "and left the rest");

  const onPositions = calls.filter((c) => c.table === "paper_positions" && c.op !== "select");
  assert.equal(onPositions.length, 1, "exactly one write to the position");
  assert.equal(
    onPositions[0].op,
    "update",
    "a partial close must shrink the position, never delete it",
  );
  assert.equal(onPositions[0].payload.volume, 0.06);

  const trades = calls.filter((c) => c.table === "broker_trades");
  assert.equal(trades.length, 1, "one trade row for the slice");
  assert.equal(trades[0].payload.volume, 0.04, "priced over the slice, not the whole position");
});

await acheck("closing all of a practice position removes it", async () => {
  const calls = [];
  const stub = makeSupabaseStub(calls, {
    id: "pos-2",
    account_id: "acc-1",
    symbol: "XAUUSD",
    side: "buy",
    volume: 0.1,
    open_price: 1900,
    stop_loss: null,
    take_profit: null,
    opened_at: "2026-10-29T10:00:00.000Z",
    quote_origin: "simulated",
  });

  const result = await closePaperPositionById(stub, "user-1", "pos-2", 0.1);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.remaining, 0);

  const onPositions = calls.filter((c) => c.table === "paper_positions" && c.op !== "select");
  assert.equal(onPositions[0].op, "delete", "a full close removes the row");
});

check("a practice position can be closed in part too", () => {
  // If paper could only close in full while live could scale out, the
  // practice account would teach a habit the real one does not allow.
  assert.ok(/decidePartialClose\(/.test(paper), "paper uses the same rule");
  assert.ok(/requestedVolume/.test(paper), "and takes the requested size");
  assert.ok(
    /\.update\(\{ volume: remaining/.test(paper),
    "a partial shrinks the position instead of deleting it",
  );
});

check("each partial slice is its own trade row, and says what it came from", () => {
  // The full close reuses the position id to stay idempotent for the watcher.
  // A partial cannot — the position lives on and may be closed again — so the
  // link back has to be carried explicitly or the journal loses the thread.
  assert.ok(/tradeRow\.id = crypto\.randomUUID\(\)/.test(paper), "a fresh id per slice");
  assert.ok(/partial_of/.test(paper), "with the position it came from");
  assert.ok(/remaining_after/.test(paper), "and what was left open");
  assert.ok(
    /external_trade_id = `paper:\$\{position\.id\}:\$\{closedAt\}`/.test(paper),
    "and an external id that cannot collide with the full close",
  );
});

check("the trade is recorded before the position is touched", () => {
  const insert = paper.indexOf('.from("broker_trades")');
  const mutate = paper.indexOf("decision.kind === \"partial\"\n      ? await supabase");
  assert.ok(insert > 0, "the trade write must exist");
  assert.ok(mutate === -1 || mutate > insert, "record first, then shrink or delete");
});

check("the reply says how much went and how much is left", () => {
  // "Closed" on its own is the answer that sends a trader to MT5 to check.
  assert.ok(/volume: closingVolume/.test(paper));
  assert.ok(/remaining,/.test(paper));
  assert.ok(/still open/.test(paper), "and in words, not only numbers");
});

console.log(`\n${passed} checks passed`);
