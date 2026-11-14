/**
 * A push that reached no device must not burn its dedup key: the retry inside
 * the cooldown has to go out. A push that did reach a device keeps the key.
 *
 * Run: node --import ./scripts/bundler-resolve.mjs --test src/lib/push/pushClaimRelease.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import type { PushSender } from "@/lib/push/deliver";

type Row = Record<string, unknown>;
type State = { deliveries: Row[]; subscriptions: Row[] };

function fakeSupabase(state: State): SupabaseClient {
  function from(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | null = null;
    const filters: Row = {};
    let inFilter: { column: string; values: unknown[] } | null = null;
    const matches = (row: Row) =>
      Object.entries(filters).every(([k, v]) => row[k] === v) &&
      (!inFilter || inFilter.values.includes(row[inFilter.column]));
    const rows = (): Row[] =>
      table === "push_event_deliveries" ? state.deliveries : table === "push_subscriptions" ? state.subscriptions : [];
    function run(single: boolean) {
      if (table === "profiles") return { data: null, error: null };
      if (op === "insert") {
        const next = payload as Row;
        if (state.deliveries.some((r) => r.user_id === next.user_id && r.event_key === next.event_key)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        state.deliveries.push({ ...next });
        return { data: null, error: null };
      }
      if (op === "update") {
        for (const r of rows()) if (matches(r)) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (op === "delete") {
        const keep = rows().filter((r) => !matches(r));
        if (table === "push_event_deliveries") state.deliveries = keep;
        else state.subscriptions = keep;
        return { data: null, error: null };
      }
      const found = rows().filter(matches);
      return { data: single ? (found[0] ?? null) : found, error: null };
    }
    const b = {
      select: () => b,
      insert: (body: Row) => ((op = "insert"), (payload = body), b),
      update: (body: Row) => ((op = "update"), (payload = body), b),
      delete: () => ((op = "delete"), b),
      eq: (c: string, v: unknown) => ((filters[c] = v), b),
      in: (c: string, v: unknown[]) => ((inFilter = { column: c, values: v }), b),
      maybeSingle: () => Promise.resolve(run(true)),
      then: <T>(ok?: (v: unknown) => T, bad?: (e: unknown) => T) => Promise.resolve(run(false)).then(ok, bad),
    };
    return b;
  }
  return { from } as unknown as SupabaseClient;
}

const USER = "trader-1";
const device = (endpoint: string) => ({ user_id: USER, endpoint, p256dh: "p", auth: "a" });
const failing = (statusCode: number): PushSender => async () => {
  throw { statusCode };
};
const ok: PushSender = async () => ({ statusCode: 201 });

function send(state: State, sender: PushSender, at: string) {
  return dispatchPushEvent({
    userId: USER,
    category: "price_alert",
    eventKey: "alert:xau:2400",
    title: "XAUUSD hit 2400",
    body: "Price alert",
    bypassPrefs: true,
    now: new Date(at),
    supabase: fakeSupabase(state),
    send: sender,
  });
}

describe("dispatchPushEvent dedup claim release", () => {
  it("lets the retry through when the first send reached no device", async () => {
    const state: State = { deliveries: [], subscriptions: [device("https://push/a")] };
    const first = await send(state, failing(500), "2026-11-11T10:00:00Z");
    assert.equal(first.sent, 0);
    assert.equal(state.deliveries.length, 0, "failed first send leaves no claim behind");

    const retry = await send(state, ok, "2026-11-11T10:00:05Z");
    assert.equal(retry.skipped, undefined);
    assert.equal(retry.sent, 1);
    assert.equal(state.deliveries.length, 1);
  });

  it("does not burn the key when the trader has no device yet", async () => {
    const state: State = { deliveries: [], subscriptions: [] };
    const first = await send(state, ok, "2026-11-11T10:00:00Z");
    assert.equal(first.skipped, "no_subscription");
    assert.equal(state.deliveries.length, 0);
  });

  it("restores the earlier timestamp when a later send inside a new window fails", async () => {
    const earlier = "2026-11-10T08:00:00.000Z";
    const state: State = {
      deliveries: [{ user_id: USER, event_key: "alert:xau:2400", category: "price_alert", last_sent_at: earlier }],
      subscriptions: [device("https://push/a")],
    };
    const res = await send(state, failing(503), "2026-11-11T10:00:00Z");
    assert.equal(res.sent, 0);
    assert.equal(state.deliveries[0].last_sent_at, earlier);
  });

  it("keeps the claim after a successful send so the repeat is rate-limited", async () => {
    const state: State = { deliveries: [], subscriptions: [device("https://push/a")] };
    const first = await send(state, ok, "2026-11-11T10:00:00Z");
    assert.equal(first.sent, 1);
    const repeat = await send(state, ok, "2026-11-11T10:00:05Z");
    assert.equal(repeat.skipped, "rate_limited");
  });
});
