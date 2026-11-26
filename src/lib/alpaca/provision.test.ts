/**
 * Alpaca paper provision must merge into `user_broker_accounts.metadata`.
 *
 * The accounts page and `/api/alpaca/provision` refresh an existing row on
 * every load. The json blob is shared with trading rules, account size, and
 * Trading OS (`tosProgramId` / `tosAssignment` / `tosMaxRiskPerTradePercent`).
 * Writing a fresh `{ alpaca, paper, … }` object used to wipe those keys.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/alpaca/provision.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAlpacaPaperAccount } from "@/lib/alpaca/provision";
import { ALPACA_CONNECTION_METHOD } from "@/lib/broker/accountKind";

const USER = "trader-owner";
const ACCOUNT_ID = "acct-alpaca";

const KEPT_KEYS = {
  tradingRules: { maxDailyLossPct: 4, newsTradingAllowed: true },
  tradingRulesStatedAt: "2026-11-01T00:00:00.000Z",
  accountSize: 200_000,
  firmModel: "Oracle",
  tosProgramId: "tos-prog-1",
  tosAssignment: "tos-assign-1",
  tosMaxRiskPerTradePercent: 0.5,
  customUnknown: "must-survive",
} as const;

type Row = Record<string, unknown> & { id: string; user_id: string };

function fakeSupabase(rows: Row[]) {
  function from(table: string) {
    if (table !== "user_broker_accounts") throw new Error(`unexpected table ${table}`);
    let op = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};

    const run = () => {
      if (op === "insert") {
        const created = { id: `acct-new-${rows.length}`, ...payload } as Row;
        rows.push(created);
        return [created];
      }
      const found = rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      if (op === "update") for (const r of found) Object.assign(r, payload);
      return found;
    };

    const builder = {
      select: () => builder,
      update: (body: Record<string, unknown>) => {
        op = "update";
        payload = body;
        return builder;
      },
      insert: (body: Record<string, unknown>) => {
        op = "insert";
        payload = body;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: <T>(onFulfilled?: (value: { data: unknown; error: null }) => T) =>
        Promise.resolve({ data: run(), error: null }).then(onFulfilled),
    };
    return builder;
  }

  return { from } as unknown as SupabaseClient;
}

const PREV_ENABLE = process.env.NEXT_PUBLIC_ENABLE_ALPACA_BROKER;
const PREV_KEY = process.env.ALPACA_PAPER_API_KEY_ID;
const PREV_SECRET = process.env.ALPACA_PAPER_API_SECRET_KEY;
const PREV_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_ENABLE_ALPACA_BROKER = "1";
  process.env.ALPACA_PAPER_API_KEY_ID = "test-key";
  process.env.ALPACA_PAPER_API_SECRET_KEY = "test-secret";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        id: "alpaca-remote-id",
        account_number: "PA123456",
        status: "ACTIVE",
        equity: "123456.78",
        buying_power: "246913.56",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
});

afterEach(() => {
  if (PREV_ENABLE === undefined) delete process.env.NEXT_PUBLIC_ENABLE_ALPACA_BROKER;
  else process.env.NEXT_PUBLIC_ENABLE_ALPACA_BROKER = PREV_ENABLE;
  if (PREV_KEY === undefined) delete process.env.ALPACA_PAPER_API_KEY_ID;
  else process.env.ALPACA_PAPER_API_KEY_ID = PREV_KEY;
  if (PREV_SECRET === undefined) delete process.env.ALPACA_PAPER_API_SECRET_KEY;
  else process.env.ALPACA_PAPER_API_SECRET_KEY = PREV_SECRET;
  if (PREV_SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = PREV_SERVICE;
  globalThis.fetch = realFetch;
});

describe("ensureAlpacaPaperAccount metadata merge", () => {
  it("keeps unknown keys on an existing row and still updates Alpaca-owned keys", async () => {
    const rows: Row[] = [
      {
        id: ACCOUNT_ID,
        user_id: USER,
        connection_method: ALPACA_CONNECTION_METHOD,
        external_connection_id: "stale-id",
        metadata: {
          ...KEPT_KEYS,
          alpaca: true,
          equity: 100_000,
        },
      },
    ];

    const result = await ensureAlpacaPaperAccount(fakeSupabase(rows), USER);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, false);
    assert.equal(result.accountId, ACCOUNT_ID);

    const meta = rows[0].metadata as Record<string, unknown>;
    assert.equal(meta.customUnknown, "must-survive");
    assert.deepEqual(meta.tradingRules, KEPT_KEYS.tradingRules);
    assert.equal(meta.tradingRulesStatedAt, KEPT_KEYS.tradingRulesStatedAt);
    assert.equal(meta.accountSize, KEPT_KEYS.accountSize);
    assert.equal(meta.firmModel, KEPT_KEYS.firmModel);
    assert.equal(meta.tosProgramId, KEPT_KEYS.tosProgramId);
    assert.equal(meta.tosAssignment, KEPT_KEYS.tosAssignment);
    assert.equal(meta.tosMaxRiskPerTradePercent, KEPT_KEYS.tosMaxRiskPerTradePercent);

    assert.equal(meta.alpaca, true);
    assert.equal(meta.paper, true);
    assert.equal(meta.platform_managed, true);
    assert.equal(meta.account_number, "PA123456");
    assert.equal(meta.equity, 123456.78);
    assert.equal(meta.buying_power, 246913.56);
    assert.equal(rows[0].external_connection_id, "alpaca-remote-id");
  });
});
