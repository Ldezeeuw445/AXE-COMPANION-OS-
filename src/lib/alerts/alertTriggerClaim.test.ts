import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimAlertTrigger, triggerCooldownCutoff } from "./alertTriggerClaim";

type Row = { id: string; user_id: string; status: string; triggered_at: string | null };

/** Tiny in-memory stand-in that applies the same filters the route sends. */
function fakeSupabase(rows: Row[], fail = false) {
  return {
    from() {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Partial<Row> = {};
      const q = {
        update(p: Partial<Row>) { patch = p; return q; },
        eq(col: keyof Row, v: string) { filters.push((r) => r[col] === v); return q; },
        or(expr: string) {
          const cutoff = expr.split("triggered_at.lt.")[1];
          filters.push((r) => r.triggered_at == null || r.triggered_at < cutoff);
          return q;
        },
        async select() {
          if (fail) return { data: null, error: { message: "boom" } };
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          hit.forEach((r) => Object.assign(r, { triggered_at: patch.triggered_at }));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const base = { alertId: "a1", userId: "u1", cooldownSeconds: 60, metadata: {} };
const now = "2026-11-12T15:00:00.000Z";

test("cutoff is now minus cooldown", () => {
  assert.equal(triggerCooldownCutoff(Date.parse(now), 60), "2026-11-12T14:59:00.000Z");
});

test("first trigger claims a never-fired alert", async () => {
  const rows: Row[] = [{ id: "a1", user_id: "u1", status: "active", triggered_at: null }];
  assert.deepEqual(await claimAlertTrigger(fakeSupabase(rows), { ...base, nowIso: now }), { claimed: true });
  assert.equal(rows[0].triggered_at, now);
});

test("second concurrent trigger loses the claim (no double auto-trade)", async () => {
  const rows: Row[] = [{ id: "a1", user_id: "u1", status: "active", triggered_at: null }];
  const sb = fakeSupabase(rows);
  const [a, b] = [
    await claimAlertTrigger(sb, { ...base, nowIso: now }),
    await claimAlertTrigger(sb, { ...base, nowIso: now }),
  ];
  assert.equal(a.claimed, true);
  assert.equal(b.claimed, false);
});

test("inside cooldown is not claimed, after cooldown is", async () => {
  const rows: Row[] = [{ id: "a1", user_id: "u1", status: "active", triggered_at: "2026-11-12T14:59:30.000Z" }];
  assert.equal((await claimAlertTrigger(fakeSupabase(rows), { ...base, nowIso: now })).claimed, false);
  assert.equal(
    (await claimAlertTrigger(fakeSupabase(rows), { ...base, nowIso: "2026-11-12T15:00:31.000Z" })).claimed,
    true,
  );
});

test("paused alert or other user's alert is never claimed", async () => {
  const paused: Row[] = [{ id: "a1", user_id: "u1", status: "paused", triggered_at: null }];
  assert.equal((await claimAlertTrigger(fakeSupabase(paused), { ...base, nowIso: now })).claimed, false);
  const other: Row[] = [{ id: "a1", user_id: "u2", status: "active", triggered_at: null }];
  assert.equal((await claimAlertTrigger(fakeSupabase(other), { ...base, nowIso: now })).claimed, false);
});

test("database error is surfaced, not treated as claimed", async () => {
  const rows: Row[] = [{ id: "a1", user_id: "u1", status: "active", triggered_at: null }];
  assert.deepEqual(await claimAlertTrigger(fakeSupabase(rows, true), { ...base, nowIso: now }), {
    claimed: false,
    error: "boom",
  });
});
