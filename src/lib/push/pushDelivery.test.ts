/**
 * PHASE C6, the half that was never covered: does an alert actually reach a phone?
 *
 * `pushEvents.test.ts` tests the leaves — deep links, payload shape, the dedup
 * *decision*, prefs, the service worker's click handling. Every one of those
 * passed while the thing that strings them together, `dispatchPushEvent`, had
 * no test at all. It could not have one: `dispatch.ts` and `deliver.ts` both
 * declare `import "server-only"`, a marker package Next aliases away in its own
 * bundler and which is not in node_modules, so no test runner could import
 * them. `scripts/bundler-resolve.mjs` resolves it to an empty module, which is
 * what it compiles to on the server anyway.
 *
 * So this file drives the real production orchestrator over a fake Supabase and
 * a fake sender, and asserts the whole chain a watcher alert travels:
 *
 *   announce() -> dispatchPushEvent -> prefs -> quiet hours -> dedup claim
 *              -> push_subscriptions fan-out -> send -> prune dead endpoints
 *
 * The two seams this needs (`supabase`, `send`) are both injection points on
 * the real functions; nothing is re-implemented here.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/push/pushDelivery.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import type { PushSender } from "@/lib/push/deliver";

type DeliveryRow = {
  user_id: string;
  event_key: string;
  category: string;
  last_sent_at: string;
};

type SubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type FakeState = {
  profiles: Record<string, { preferences?: unknown; timezone?: string | null }>;
  deliveries: DeliveryRow[];
  subscriptions: SubscriptionRow[];
  /** Set to simulate a project where the dedup table was never migrated. */
  deliveriesTableMissing?: boolean;
};

type PgError = { code: string; message: string } | null;

const UNIQUE_VIOLATION = "23505";
const MISSING_TABLE = "42P01";

/**
 * Just enough of the supabase-js query builder for the calls this path makes.
 * It enforces the one invariant the real schema enforces and the dedup logic
 * leans on: `push_event_deliveries` is unique on (user_id, event_key).
 */
function fakeSupabase(state: FakeState): SupabaseClient {
  function from(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};
    let inFilter: { column: string; values: unknown[] } | null = null;

    const matches = (row: Record<string, unknown>) =>
      Object.entries(filters).every(([column, value]) => row[column] === value) &&
      (!inFilter || inFilter.values.includes(row[inFilter.column]));

    function run(single: boolean): { data: unknown; error: PgError } {
      if (table === "profiles") {
        const row = state.profiles[filters.id as string] ?? null;
        return { data: row, error: null };
      }

      if (table === "push_event_deliveries") {
        if (state.deliveriesTableMissing) {
          return {
            data: null,
            error: { code: MISSING_TABLE, message: 'relation "push_event_deliveries" does not exist' },
          };
        }
        if (op === "insert") {
          const next = payload as unknown as DeliveryRow;
          const clash = state.deliveries.some(
            (r) => r.user_id === next.user_id && r.event_key === next.event_key,
          );
          if (clash) {
            return { data: null, error: { code: UNIQUE_VIOLATION, message: "duplicate key" } };
          }
          state.deliveries.push({ ...next });
          return { data: null, error: null };
        }
        if (op === "update") {
          for (const row of state.deliveries) {
            if (matches(row as unknown as Record<string, unknown>)) Object.assign(row, payload);
          }
          return { data: null, error: null };
        }
        const found = state.deliveries.filter((r) => matches(r as unknown as Record<string, unknown>));
        return { data: single ? (found[0] ?? null) : found, error: null };
      }

      if (table === "push_subscriptions") {
        if (op === "delete") {
          state.subscriptions = state.subscriptions.filter(
            (r) => !matches(r as unknown as Record<string, unknown>),
          );
          return { data: null, error: null };
        }
        const found = state.subscriptions.filter((r) => matches(r as unknown as Record<string, unknown>));
        return { data: single ? (found[0] ?? null) : found, error: null };
      }

      throw new Error(`fakeSupabase: unexpected table ${table}`);
    }

    const builder = {
      select: () => builder,
      insert: (body: Record<string, unknown>) => {
        op = "insert";
        payload = body;
        return builder;
      },
      update: (body: Record<string, unknown>) => {
        op = "update";
        payload = body;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        inFilter = { column, values };
        return builder;
      },
      maybeSingle: () => Promise.resolve(run(true)),
      // Awaiting the builder itself runs the query, as supabase-js does.
      then: <T>(
        onFulfilled?: (value: { data: unknown; error: PgError }) => T,
        onRejected?: (reason: unknown) => T,
      ) => Promise.resolve(run(false)).then(onFulfilled, onRejected),
    };

    return builder;
  }

  return { from } as unknown as SupabaseClient;
}

/** A sender that records what it was asked to deliver, and to where. */
function recordingSender(failFor: Record<string, number> = {}) {
  const calls: { endpoint: string; payload: string }[] = [];
  const send: PushSender = async (subscription, payload) => {
    calls.push({ endpoint: subscription.endpoint, payload });
    const statusCode = failFor[subscription.endpoint];
    if (statusCode) throw { statusCode };
    return { statusCode: 201 };
  };
  return { send, calls };
}

const USER = "trader-1";

function stateWithDevices(endpoints: string[], profile?: { preferences?: unknown; timezone?: string | null }): FakeState {
  return {
    profiles: profile ? { [USER]: profile } : {},
    deliveries: [],
    subscriptions: endpoints.map((endpoint, i) => ({
      user_id: USER,
      endpoint,
      p256dh: `key-${i}`,
      auth: `auth-${i}`,
    })),
  };
}

/** The arguments the watcher's own `firePush` passes for a drawdown alert. */
function watcherAlert(overrides: Partial<Parameters<typeof dispatchPushEvent>[0]> = {}) {
  return {
    userId: USER,
    category: "risk_alert" as const,
    eventKey: "drawdown:acct-7:2026-10-28",
    title: "AXE · Daily loss limit is close",
    body: "You are 0.4% from the daily loss limit on acct-7. Stop or size down.",
    url: "/positions",
    now: new Date("2026-10-28T12:00:00.000Z"),
    ...overrides,
  };
}

describe("C6 push delivery path", () => {
  it("delivers a watcher alert to every subscribed device", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a", "https://fcm.example/dev-b"]);
    const { send, calls } = recordingSender();

    const result = await dispatchPushEvent({
      ...watcherAlert(),
      supabase: fakeSupabase(state),
      send,
    });

    assert.equal(result.ok, true);
    assert.equal(result.skipped, undefined);
    assert.equal(result.total, 2);
    assert.equal(result.sent, 2);
    assert.equal(result.expired, 0);

    // Both of the trader's devices, and nothing else.
    assert.deepEqual(
      calls.map((c) => c.endpoint).sort(),
      ["https://fcm.example/dev-a", "https://fcm.example/dev-b"],
    );

    // What the phone actually receives: the alert, deep-linked to /positions.
    const payload = JSON.parse(calls[0].payload);
    assert.equal(payload.title, "AXE · Daily loss limit is close");
    assert.equal(payload.body, "You are 0.4% from the daily loss limit on acct-7. Stop or size down.");
    assert.equal(payload.url, "/positions");
    assert.equal(payload.category, "risk_alert");
    assert.equal(payload.eventKey, "drawdown:acct-7:2026-10-28");
    assert.equal(payload.severity, "risk");
    assert.equal(payload.requireInteraction, true);
    assert.equal(payload.data.url, "/positions");
    // /positions is a safe push target but not one of the five shell tabs, so
    // there is no tab for the service worker to restore.
    assert.equal(payload.data.session.lastTab, undefined);

    // The send was claimed, so a second producer cannot repeat it.
    assert.equal(state.deliveries.length, 1);
    assert.equal(state.deliveries[0].event_key, "drawdown:acct-7:2026-10-28");
    assert.equal(state.deliveries[0].last_sent_at, "2026-10-28T12:00:00.000Z");
  });

  it("carries the chart session a price alert should open on", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a"]);
    const { send, calls } = recordingSender();

    const result = await dispatchPushEvent({
      userId: USER,
      category: "price_alert",
      eventKey: "alert:xauusd:2410",
      title: "XAUUSD crossed 2410",
      body: "Your level is in.",
      symbol: "xauusd",
      timeframe: "15m",
      now: new Date("2026-10-28T12:00:00.000Z"),
      supabase: fakeSupabase(state),
      send,
    });

    assert.equal(result.sent, 1);
    const payload = JSON.parse(calls[0].payload);
    // No url was given, so the category picks the chart and normalizes both args.
    assert.equal(payload.url, "/chart?symbol=XAUUSD&tf=m15");
    assert.equal(payload.data.session.symbol, "XAUUSD");
    assert.equal(payload.data.session.timeframe, "m15");
    assert.equal(payload.data.session.lastTab, "chart");
  });

  it("reports no_subscription instead of failing when the trader has no device", async () => {
    const state = stateWithDevices([]);
    const { send, calls } = recordingSender();

    const result = await dispatchPushEvent({
      ...watcherAlert(),
      supabase: fakeSupabase(state),
      send,
    });

    // ok: the alert is in the feed, there is simply nowhere to push it.
    assert.equal(result.ok, true);
    assert.equal(result.skipped, "no_subscription");
    assert.equal(result.sent, 0);
    assert.equal(calls.length, 0);
  });

  it("does not send a category the trader switched off", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a"], {
      preferences: { push: { categories: { risk_alert: false } } },
    });
    const { send, calls } = recordingSender();

    const result = await dispatchPushEvent({
      ...watcherAlert(),
      supabase: fakeSupabase(state),
      send,
    });

    assert.equal(result.skipped, "category_disabled");
    assert.equal(calls.length, 0);
    // Nothing was claimed, so the alert can still fire once the trader re-enables it.
    assert.equal(state.deliveries.length, 0);
  });

  it("holds an alert raised inside quiet hours", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a"], {
      preferences: { push: { quietHours: { enabled: true, start: "22:00", end: "07:00" } } },
      timezone: "UTC",
    });
    const { send, calls } = recordingSender();

    const result = await dispatchPushEvent({
      ...watcherAlert({ now: new Date("2026-10-28T23:30:00.000Z") }),
      supabase: fakeSupabase(state),
      send,
    });

    assert.equal(result.skipped, "quiet_hours");
    assert.equal(calls.length, 0);
  });

  it("sends an alert once, then rate-limits the repeat and releases after the cooldown", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a"]);
    const supabase = fakeSupabase(state);
    const { send, calls } = recordingSender();

    const first = await dispatchPushEvent({ ...watcherAlert(), supabase, send });
    assert.equal(first.sent, 1);

    // Same event, two minutes later. risk_alert cools down for an hour.
    const repeat = await dispatchPushEvent({
      ...watcherAlert({ now: new Date("2026-10-28T12:02:00.000Z") }),
      supabase,
      send,
    });
    assert.equal(repeat.ok, true);
    assert.equal(repeat.skipped, "rate_limited");
    assert.equal(calls.length, 1, "the repeat must not reach the device");

    // Past the hour, the same condition is news again.
    const later = await dispatchPushEvent({
      ...watcherAlert({ now: new Date("2026-10-28T13:30:00.000Z") }),
      supabase,
      send,
    });
    assert.equal(later.sent, 1);
    assert.equal(calls.length, 2);
    assert.equal(state.deliveries.length, 1, "the claim is updated, not duplicated");
    assert.equal(state.deliveries[0].last_sent_at, "2026-10-28T13:30:00.000Z");
  });

  it("delivers to the live device and prunes only the dead endpoint", async () => {
    const state = stateWithDevices([
      "https://fcm.example/live",
      "https://fcm.example/uninstalled",
      "https://fcm.example/flaky",
    ]);
    // 410 Gone = the subscription is dead. 500 = the push service had a bad day.
    const { send, calls } = recordingSender({
      "https://fcm.example/uninstalled": 410,
      "https://fcm.example/flaky": 500,
    });

    const result = await dispatchPushEvent({
      ...watcherAlert(),
      supabase: fakeSupabase(state),
      send,
    });

    assert.equal(calls.length, 3);
    assert.equal(result.total, 3);
    assert.equal(result.sent, 1);
    assert.equal(result.expired, 1);
    assert.equal(result.ok, true);

    // The dead endpoint is gone; the one that merely failed is kept for next time.
    assert.deepEqual(
      state.subscriptions.map((s) => s.endpoint).sort(),
      ["https://fcm.example/flaky", "https://fcm.example/live"],
    );
  });

  it("still reaches the device when the dedup table is missing", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a"]);
    state.deliveriesTableMissing = true;
    const { send, calls } = recordingSender();

    const result = await dispatchPushEvent({
      ...watcherAlert(),
      supabase: fakeSupabase(state),
      send,
    });

    // Fail open: an un-migrated project should not silence every alert.
    assert.equal(result.sent, 1);
    assert.equal(calls.length, 1);
  });

  it("bypassDedup lets the signed-in test suite re-send the same event", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a"]);
    const supabase = fakeSupabase(state);
    const { send, calls } = recordingSender();

    await dispatchPushEvent({ ...watcherAlert(), supabase, send, bypassDedup: true });
    await dispatchPushEvent({ ...watcherAlert(), supabase, send, bypassDedup: true });

    assert.equal(calls.length, 2);
    assert.equal(state.deliveries.length, 0);
  });

  it("bypassPrefs overrides a switched-off category for the test suite", async () => {
    const state = stateWithDevices(["https://fcm.example/dev-a"], {
      preferences: { push: { categories: { risk_alert: false } } },
    });
    const { send, calls } = recordingSender();

    const result = await dispatchPushEvent({
      ...watcherAlert(),
      supabase: fakeSupabase(state),
      send,
      bypassPrefs: true,
    });

    assert.equal(result.sent, 1);
    assert.equal(calls.length, 1);
  });
});
