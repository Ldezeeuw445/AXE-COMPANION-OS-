/**
 * The feed row was never the problem. The push was.
 *
 * `recordProactiveFeedEvent` writes the timeline row, then pushes it. It used
 * to start the push with `void fireFeedPush(...)` and return immediately. Every
 * producer that goes through this helper runs inside a server action or a cron
 * route — closed-trade alerts from the MT5 sync, auto-trade alerts, execution
 * requests, triggered price alerts — and once such a handler returns, the
 * runtime is free to freeze or discard whatever is still pending.
 *
 * The failure mode is silent and asymmetric: the row is already committed, so
 * the alert appears in the in-app feed and the trader assumes push is working.
 * It is the one alert they were relying on never arriving, with nothing in any
 * log to say so.
 *
 * These tests pin the ordering, which is the only thing that was wrong.
 *
 * Run: node --test --import=./scripts/node-ts-loader.mjs src/lib/feed/recordProactiveFeedEvent.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordProactiveFeedEvent, type FeedPushDispatcher } from "@/lib/feed/recordProactiveFeedEvent";

type InsertedRow = Record<string, unknown>;

/**
 * Drain the microtask queue completely.
 *
 * `await Promise.resolve()` yields a single tick, which is not enough: the
 * helper awaits its insert first, so one tick does not even get it as far as
 * the push. A `setImmediate` turn lets every pending microtask settle, so if
 * the helper is going to return without waiting, it has returned by now.
 */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Minimal stand-in for the single `insert` this helper performs. */
function fakeSupabase(opts: { error?: { code: string; message: string } } = {}) {
  const inserted: InsertedRow[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, "axe_proactive_events");
      return {
        insert(row: InsertedRow) {
          if (!opts.error) inserted.push(row);
          return Promise.resolve({ error: opts.error ?? null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, inserted };
}

/** A dispatcher that only settles when told to, so ordering is observable. */
function deferredDispatcher() {
  const seen: Parameters<FeedPushDispatcher>[0][] = [];
  let release: (() => void) | null = null;
  let finished = false;

  const dispatch: FeedPushDispatcher = (input) => {
    seen.push(input);
    return new Promise<void>((resolve) => {
      release = () => {
        finished = true;
        resolve();
      };
    });
  };

  return {
    dispatch,
    seen,
    get finished() {
      return finished;
    },
    release() {
      assert.ok(release, "dispatch was never called");
      release();
    },
  };
}

describe("recordProactiveFeedEvent", () => {
  it("does not resolve until the push has actually been delivered", async () => {
    const { client, inserted } = fakeSupabase();
    const pusher = deferredDispatcher();

    let resolved = false;
    const pending = recordProactiveFeedEvent(
      client,
      "trader-1",
      "trade-close:99",
      "Trade closed: XAUUSD",
      "buy +120.50 — AXE has scored it",
      "/journal",
      { dispatch: pusher.dispatch },
    ).then((value) => {
      resolved = true;
      return value;
    });

    // The row is written and the push is in flight.
    await flush();
    assert.equal(inserted.length, 1);
    assert.equal(pusher.seen.length, 1);

    // This is the regression: the helper must still be waiting here. With
    // `void fireFeedPush(...)` it had already returned, leaving the push to be
    // dropped the moment the serverless handler finished.
    assert.equal(resolved, false, "returned before the push was delivered");
    assert.equal(pusher.finished, false);

    pusher.release();
    assert.equal(await pending, true);
    assert.equal(pusher.finished, true);
  });

  it("pushes the feed row's own title, body and url", async () => {
    const { client } = fakeSupabase();
    const pusher = deferredDispatcher();

    const pending = recordProactiveFeedEvent(
      client,
      "trader-1",
      "drawdown:acct-7",
      "Daily loss limit is close",
      "0.4% to go on acct-7.",
      "/positions",
      { category: "risk_alert", dispatch: pusher.dispatch },
    );
    await flush();
    pusher.release();
    await pending;

    assert.deepEqual(pusher.seen[0], {
      userId: "trader-1",
      category: "risk_alert",
      // Namespaced so a feed push cannot collide with the watcher's own claim
      // on the same underlying event.
      eventKey: "feed:drawdown:acct-7",
      title: "AXE · Daily loss limit is close",
      body: "0.4% to go on acct-7.",
      url: "/positions",
      tag: "feed-drawdown:acct-7",
    });
  });

  it("defaults to the axe_finding category", async () => {
    const { client } = fakeSupabase();
    const pusher = deferredDispatcher();

    const pending = recordProactiveFeedEvent(
      client,
      "trader-1",
      "weak-spot:1",
      "A pattern in your losses",
      "Three of four losses were counter-trend.",
      "/journal",
      { dispatch: pusher.dispatch },
    );
    await flush();
    pusher.release();
    await pending;

    assert.equal(pusher.seen[0].category, "axe_finding");
  });

  it("writes the row without pushing when push is off", async () => {
    const { client, inserted } = fakeSupabase();
    const pusher = deferredDispatcher();

    const ok = await recordProactiveFeedEvent(
      client,
      "trader-1",
      "quiet:1",
      "Nothing to see",
      "Logged, not announced.",
      "/feed",
      { push: false, dispatch: pusher.dispatch },
    );

    assert.equal(ok, true);
    assert.equal(inserted.length, 1);
    assert.equal(pusher.seen.length, 0);
  });

  it("says the same thing twice to nobody", async () => {
    const { client, inserted } = fakeSupabase({
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const pusher = deferredDispatcher();

    const ok = await recordProactiveFeedEvent(
      client,
      "trader-1",
      "trade-close:99",
      "Trade closed: XAUUSD",
      "buy +120.50",
      "/journal",
      { dispatch: pusher.dispatch },
    );

    // Already announced: no row, and no second buzz on the phone.
    assert.equal(ok, false);
    assert.equal(inserted.length, 0);
    assert.equal(pusher.seen.length, 0);
  });

  it("a push that throws cannot undo the feed row", async () => {
    const { client, inserted } = fakeSupabase();
    const exploding: FeedPushDispatcher = () => Promise.reject(new Error("push service down"));

    const ok = await recordProactiveFeedEvent(
      client,
      "trader-1",
      "exec:7",
      "Order rejected",
      "The broker refused it.",
      "/positions",
      { dispatch: exploding },
    );

    assert.equal(ok, true);
    assert.equal(inserted.length, 1);
  });
});
