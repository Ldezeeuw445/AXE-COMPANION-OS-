/**
 * TOS-SEC-2: are the broker hub's per-broker adapters owner-scoped on their own?
 *
 * `supabaseDatabase.test.ts` holds the hub's account store to filtering
 * `user_id`. The broker adapters (MT5, Alpaca, IBKR) are the other half of the
 * same hub and wrote `user_broker_accounts` by `id` alone: `disconnect` and the
 * IBKR doctor updated whatever row the id named, with RLS as the only thing
 * keeping it the caller's. `accountId` arrives from a request body
 * (`src/app/api/broker/hub/route.ts`), so on a client without RLS that is one
 * trader disconnecting — or, for IBKR, rewriting the metadata of — another's
 * account.
 *
 * Same method as the store's test: the fake below has **no row-level
 * security**, the way a service-role client behaves. Only the filters the
 * adapter sends narrow the rows, so only an explicit `.eq("user_id", …)` can
 * pass. Every case here fails against the previous version of the adapters.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/broker/hub/adapters/brokerAdapterScope.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrokerApiAdapter } from "@/lib/broker/hub/contract";
import { createAlpacaBrokerApiAdapter } from "@/lib/broker/hub/adapters/alpacaLive";
import { createIbkrBrokerApiAdapter } from "@/lib/broker/hub/adapters/ibkrGateway";
import { createMt5BrokerApiAdapter } from "@/lib/broker/hub/adapters/mt5BrokerApi";

const OWNER = "trader-owner";
const OTHER = "trader-other";

type Row = Record<string, unknown> & { id: string; user_id: string };
type Statement = { op: string; filters: Record<string, unknown> };

function row(id: string, userId: string): Row {
  return {
    id,
    user_id: userId,
    label: id,
    provider: "ibkr",
    connection_method: "ibkr_gateway_paper",
    external_connection_id: id.toUpperCase(),
    provider_status: "connected",
    hub_status: "connected",
    metadata: {
      ibkr: { accountId: id.toUpperCase(), gatewayHost: "127.0.0.1", gatewayPort: 4002, executionEnabled: false },
    },
  };
}

/** An un-scoped `user_broker_accounts`: no RLS, filters are all there is. */
function fakeSupabase(rows: Row[]) {
  const statements: Statement[] = [];

  function from(table: string) {
    if (table !== "user_broker_accounts") throw new Error(`fakeSupabase: unexpected table ${table}`);
    let op = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};

    const run = () => {
      statements.push({ op, filters: { ...filters } });
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
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: <T>(onFulfilled?: (value: { data: unknown; error: null }) => T) =>
        Promise.resolve({ data: run(), error: null }).then(onFulfilled),
    };
    return builder;
  }

  return {
    client: { from } as unknown as SupabaseClient,
    statements,
    allScoped: () => statements.length > 0 && statements.every((s) => s.filters.user_id === OWNER),
  };
}

function setup() {
  const rows = [row("acct-own", OWNER), row("acct-other", OTHER)];
  const db = fakeSupabase(rows);
  const byId = (id: string) => rows.find((r) => r.id === id)!;
  return { rows, db, byId };
}

const ADAPTERS: [string, (supabase: SupabaseClient, userId: string) => BrokerApiAdapter][] = [
  ["mt5", createMt5BrokerApiAdapter],
  ["alpaca", createAlpacaBrokerApiAdapter],
  ["ibkr", createIbkrBrokerApiAdapter],
];

describe("TOS-SEC-2 broker adapters are owner-scoped without RLS", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    // IBKR's doctor probes the gateway. Answer as an authenticated gateway so
    // the doctor reaches its write; a test must never dial a real host.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ authenticated: true }), { status: 200 })) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  for (const [name, create] of ADAPTERS) {
    it(`${name}: disconnect on another trader's account id changes nothing`, async () => {
      const { db, byId } = setup();
      await create(db.client, OWNER).disconnect("acct-other");

      assert.equal(byId("acct-other").hub_status, "connected");
      assert.equal(byId("acct-other").provider_status, "connected");
      assert.ok(db.allScoped(), `${name} sent a statement without user_id: ${JSON.stringify(db.statements)}`);
    });

    it(`${name}: disconnect on the owner's own account still works`, async () => {
      const { db, byId } = setup();
      await create(db.client, OWNER).disconnect("acct-own");

      assert.equal(byId("acct-own").hub_status, "disconnected");
      assert.equal(byId("acct-own").provider_status, "disconnected");
      assert.equal(byId("acct-other").hub_status, "connected");
    });
  }

  it("mt5: the doctor cannot read another trader's account", async () => {
    const { db } = setup();
    const result = await createMt5BrokerApiAdapter(db.client, OWNER).runDoctor("acct-other");

    assert.equal(result.overallStatus, "fail");
    assert.equal(result.checks[0].message, "Not found");
    assert.ok(db.allScoped());
  });

  it("ibkr: the doctor neither reads nor rewrites another trader's account", async () => {
    const { db, byId } = setup();
    const before = JSON.stringify(byId("acct-other"));
    const result = await createIbkrBrokerApiAdapter(db.client, OWNER).runDoctor("acct-other");

    assert.equal(result.overallStatus, "fail");
    assert.equal(JSON.stringify(byId("acct-other")), before);
    assert.ok(db.allScoped());
  });

  it("ibkr: the doctor on the owner's account writes its result back, scoped", async () => {
    const { db, byId } = setup();
    const result = await createIbkrBrokerApiAdapter(db.client, OWNER).runDoctor("acct-own");

    assert.equal(result.overallStatus, "pass");
    assert.equal(byId("acct-own").provider_status, "connected");
    assert.ok((byId("acct-own").metadata as { ibkr: { lastDoctor?: unknown } }).ibkr.lastDoctor);
    assert.ok(db.statements.some((s) => s.op === "update"));
    assert.ok(db.allScoped());
  });

  for (const [name, create] of [
    ["alpaca", createAlpacaBrokerApiAdapter],
    ["ibkr", createIbkrBrokerApiAdapter],
  ] as const) {
    it(`${name}: connect refuses a user id that is not the bound owner`, async () => {
      const { db } = setup();
      const result = await create(db.client, OWNER).connect({
        brokerId: `${name}-style`,
        label: "x",
        mode: "paper",
        credentials: { _userId: OTHER, accountId: "U999" },
      });

      assert.equal(result.success, false);
      assert.match(result.error ?? "", /does not match/);
      assert.equal(db.statements.length, 0, "nothing may be read or written for a mismatched owner");
    });
  }
});
