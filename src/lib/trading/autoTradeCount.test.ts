import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoTradeEventKey, countAutoTradesToday } from "./autoTradeCount";

type Ev = { user_id: string; event_key: string; created_at: string };

/** In-memory axe_proactive_events honouring eq/like/not-like/gte. */
function fakeSupabase(rows: Ev[]) {
  const likeRe = (p: string) => new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$");
  return {
    from() {
      const f: Array<(r: Ev) => boolean> = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: keyof Ev, v: string) => (f.push((r) => r[c] === v), q),
        like: (c: keyof Ev, p: string) => (f.push((r) => likeRe(p).test(r[c])), q),
        not: (c: keyof Ev, op: string, p: string) => {
          assert.equal(op, "like");
          f.push((r) => !likeRe(p).test(r[c]));
          return q;
        },
        gte: (c: keyof Ev, v: string) => (f.push((r) => r[c] >= v), q),
        then: (res: (v: unknown) => unknown) =>
          res({ count: rows.filter((r) => f.every((x) => x(r))).length, error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const since = "2026-11-15T00:00:00.000Z";
const at = "2026-11-15T09:00:00.000Z";
const ev = (key: string): Ev => ({ user_id: "u1", event_key: key, created_at: at });

test("two accounts do not share one daily limit", async () => {
  const rows = [
    ev(autoTradeEventKey("accA", "al1", 1)),
    ev(autoTradeEventKey("accA", "al2", 2)),
    ev(autoTradeEventKey("accA", "al3", 3)),
    ev(autoTradeEventKey("accB", "al4", 4)),
  ];
  const sb = fakeSupabase(rows);
  assert.deepEqual(await countAutoTradesToday(sb, { userId: "u1", accountId: "accA", sinceIso: since }), { count: 3 });
  assert.deepEqual(await countAutoTradesToday(sb, { userId: "u1", accountId: "accB", sinceIso: since }), { count: 1 });
  assert.deepEqual(await countAutoTradesToday(sb, { userId: "u1", accountId: "accC", sinceIso: since }), { count: 0 });
});

test("legacy un-attributed rows count against every account (never loosens the cap)", async () => {
  const rows = [ev("alert_trade:al9:123"), ev(autoTradeEventKey("accA", "al1", 1))];
  const sb = fakeSupabase(rows);
  assert.deepEqual(await countAutoTradesToday(sb, { userId: "u1", accountId: "accA", sinceIso: since }), { count: 2 });
  assert.deepEqual(await countAutoTradesToday(sb, { userId: "u1", accountId: "accB", sinceIso: since }), { count: 1 });
});

test("other users' rows, failed/blocked rows and yesterday's rows are not counted", async () => {
  const rows: Ev[] = [
    { user_id: "u2", event_key: autoTradeEventKey("accA", "x", 1), created_at: at },
    ev("alert_trade_failed:al1:1"),
    ev("alert_trade_blocked:al1:risk:2026-11-15"),
    { user_id: "u1", event_key: autoTradeEventKey("accA", "old", 1), created_at: "2026-11-14T09:00:00.000Z" },
  ];
  assert.deepEqual(
    await countAutoTradesToday(fakeSupabase(rows), { userId: "u1", accountId: "accA", sinceIso: since }),
    { count: 0 },
  );
});

test("a read error is surfaced (caller fails closed)", async () => {
  const sb = {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "like", "not", "gte"]) q[m] = () => q;
      q.then = (res: (v: unknown) => unknown) => res({ count: null, error: { message: "boom" } });
      return q;
    },
  } as unknown as SupabaseClient;
  assert.deepEqual(await countAutoTradesToday(sb, { userId: "u1", accountId: "a", sinceIso: since }), { error: "boom" });
});
