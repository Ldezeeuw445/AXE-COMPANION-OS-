/**
 * TOS-SEC-2: is the broker hub's account store owner-scoped on its own?
 *
 * `revokeBlockers.test.ts` lists this file as the one blocker whose reason was
 * a defect rather than a decision: the hub's generic save/delete "filters on id
 * alone — so it must stay on the trader's client until it filters user_id too".
 * That is what this file holds it to.
 *
 * The point of the fake below is what it *does not* do: **it has no row-level
 * security.** Both traders' rows sit in one table and nothing narrows them but
 * the filters the adapter itself sends. That is deliberate — it is how a
 * service-role client behaves, which is the client TOS-SEC-2 moves these writes
 * onto. Under this fake, RLS cannot be the thing that passes the test, so only
 * an explicit `.eq("user_id", …)` can. Every case here fails against the
 * previous version of the adapter.
 *
 * `accountId` is worth stating plainly, because it is why this matters: it
 * arrives from a request body (`src/app/api/broker/hub/route.ts` reads
 * `body.accountId`) and the hub service never checks who owns it — `getAccount`
 * returning null is the whole of what makes `disconnectAccount` and
 * `updatePermissions` decline. So "the filter is present" is the access check.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/broker/hub/adapters/supabaseDatabase.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseDatabaseAdapter } from "@/lib/broker/hub/adapters/supabaseDatabase";
import type { BrokerAccountDbRow } from "@/lib/broker/hub/mappers";

const OWNER = "trader-owner";
const OTHER = "trader-other";

/** Supabase's "no rows returned" for `.single()`. */
const NO_ROWS = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };

type MappingRow = {
  id: string;
  user_id: string;
  account_id: string;
  canonical_symbol: string;
  broker_symbol: string;
  asset_class: string | null;
  exchange: string | null;
  multiplier: number | null;
  notes: string | null;
};

type FakeState = {
  accounts: BrokerAccountDbRow[];
  mappings: MappingRow[];
};

type PgError = { code: string; message: string } | null;
type Result = { data: unknown; error: PgError };

/** Every statement the fake saw, so a missing filter is visible as well as its effect. */
type Statement = { table: string; op: string; filters: Record<string, unknown> };

function account(id: string, userId: string, label: string): BrokerAccountDbRow {
  return {
    id,
    user_id: userId,
    label,
    provider: "mt5",
    status: "active",
    connection_method: "metaapi",
    provider_status: "connected",
    hub_broker_id: "mt5",
    trading_mode: "live",
    hub_status: "connected",
    hub_permissions: { tradingEnabled: false, readOnly: true },
    metadata: {},
  };
}

/**
 * An un-scoped Supabase: no RLS, so the adapter's own filters are the only
 * thing standing between a caller and another trader's row.
 */
function fakeSupabase(state: FakeState) {
  const statements: Statement[] = [];

  function from(table: string) {
    let op = "select";
    let payload: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};

    const rows = (): Record<string, unknown>[] =>
      table === "user_broker_accounts"
        ? (state.accounts as unknown as Record<string, unknown>[])
        : (state.mappings as unknown as Record<string, unknown>[]);

    const matches = (row: Record<string, unknown>) =>
      Object.entries(filters).every(([column, value]) => row[column] === value);

    function run(mode: "many" | "maybeSingle" | "single"): Result {
      if (table !== "user_broker_accounts" && table !== "broker_symbol_mappings") {
        throw new Error(`fakeSupabase: unexpected table ${table}`);
      }
      statements.push({ table, op, filters: { ...filters } });

      const found = rows().filter(matches);

      if (op === "update") {
        for (const row of found) Object.assign(row, payload);
      } else if (op === "delete") {
        const doomed = new Set(found);
        if (table === "user_broker_accounts") {
          state.accounts = state.accounts.filter(
            (r) => !doomed.has(r as unknown as Record<string, unknown>),
          );
        } else {
          state.mappings = state.mappings.filter(
            (r) => !doomed.has(r as unknown as Record<string, unknown>),
          );
        }
      } else if (op === "upsert") {
        // The schema's unique key is (account_id, canonical_symbol).
        const next = payload as unknown as MappingRow;
        const at = state.mappings.findIndex(
          (r) =>
            r.account_id === next.account_id && r.canonical_symbol === next.canonical_symbol,
        );
        if (at === -1) {
          state.mappings.push({ ...next, id: `mapping-${state.mappings.length + 1}` });
          return { data: state.mappings[state.mappings.length - 1], error: null };
        }
        Object.assign(state.mappings[at], next);
        return { data: state.mappings[at], error: null };
      }

      if (mode === "many") return { data: found, error: null };
      if (mode === "single") {
        return found.length === 1 ? { data: found[0], error: null } : { data: null, error: NO_ROWS };
      }
      return { data: found[0] ?? null, error: null };
    }

    const builder = {
      select: () => builder,
      insert: (body: Record<string, unknown>) => {
        op = "insert";
        payload = body;
        return builder;
      },
      upsert: (body: Record<string, unknown>) => {
        op = "upsert";
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
      order: () => builder,
      maybeSingle: () => Promise.resolve(run("maybeSingle")),
      single: () => Promise.resolve(run("single")),
      then: <T>(
        onFulfilled?: (value: Result) => T,
        onRejected?: (reason: unknown) => T,
      ) => Promise.resolve(run("many")).then(onFulfilled, onRejected),
    };

    return builder;
  }

  return {
    client: { from } as unknown as SupabaseClient,
    statements,
    /** Did every statement against `table` carry a user_id filter? */
    allScoped: (table: string) =>
      statements
        .filter((s) => s.table === table)
        .every((s) => s.filters.user_id === OWNER),
  };
}

function setup() {
  const state: FakeState = {
    accounts: [account("acct-own", OWNER, "My account"), account("acct-other", OTHER, "Theirs")],
    mappings: [
      {
        id: "mapping-own",
        user_id: OWNER,
        account_id: "acct-own",
        canonical_symbol: "EURUSD",
        broker_symbol: "EURUSD.x",
        asset_class: "forex",
        exchange: null,
        multiplier: null,
        notes: null,
      },
      {
        id: "mapping-other",
        user_id: OTHER,
        account_id: "acct-other",
        canonical_symbol: "EURUSD",
        broker_symbol: "EURUSD.pro",
        asset_class: "forex",
        exchange: null,
        multiplier: null,
        notes: null,
      },
    ],
  };
  const fake = fakeSupabase(state);
  return { state, fake, adapter: new SupabaseDatabaseAdapter(fake.client, OWNER) };
}

describe("SupabaseDatabaseAdapter is owner-scoped without RLS", () => {
  it("getAccount returns the owner's account", async () => {
    const { adapter } = setup();
    const found = await adapter.getAccount("acct-own");
    assert.equal(found?.id, "acct-own");
    assert.equal(found?.userId, OWNER);
  });

  it("getAccount cannot read another trader's account by id", async () => {
    const { adapter, fake } = setup();
    // The id is real and the client is un-scoped; only the filter can refuse it.
    assert.equal(await adapter.getAccount("acct-other"), null);
    assert.ok(fake.allScoped("user_broker_accounts"));
  });

  it("listAccounts returns only the owner's rows", async () => {
    const { adapter } = setup();
    const accounts = await adapter.listAccounts(OWNER);
    assert.deepEqual(
      accounts.map((a) => a.id),
      ["acct-own"],
    );
  });

  it("listAccounts refuses a user the adapter was not built for", async () => {
    const { adapter } = setup();
    // Silently answering for one of the two ids would hide a miswired hub.
    await assert.rejects(() => adapter.listAccounts(OTHER), /built for a different user/);
  });

  it("saveAccount writes the owner's row", async () => {
    const { adapter, state } = setup();
    const mine = await adapter.getAccount("acct-own");
    assert.ok(mine);

    const saved = await adapter.saveAccount({ ...mine, status: "disconnected" });

    assert.equal(saved.status, "disconnected");
    assert.equal(state.accounts.find((r) => r.id === "acct-own")?.hub_status, "disconnected");
  });

  it("saveAccount cannot write another trader's row", async () => {
    const { adapter, state } = setup();
    const mine = await adapter.getAccount("acct-own");
    assert.ok(mine);

    // The shape the hub would build if a foreign accountId reached it: the
    // caller's own patch, aimed at someone else's id.
    await assert.rejects(() =>
      adapter.saveAccount({ ...mine, id: "acct-other", status: "disconnected" }),
    );

    const theirs = state.accounts.find((r) => r.id === "acct-other");
    assert.equal(theirs?.hub_status, "connected", "the other trader's row was modified");
  });

  it("deleteAccount removes the owner's row", async () => {
    const { adapter, state } = setup();
    await adapter.deleteAccount("acct-own");
    assert.deepEqual(
      state.accounts.map((r) => r.id),
      ["acct-other"],
    );
  });

  it("deleteAccount cannot delete another trader's row", async () => {
    const { adapter, state } = setup();
    // Resolves without error, exactly as a filtered delete that matched nothing
    // does — the assertion that matters is that the row survived.
    await adapter.deleteAccount("acct-other");
    assert.deepEqual(
      state.accounts.map((r) => r.id),
      ["acct-own", "acct-other"],
    );
  });

  it("listSymbolMappings returns the owner's mappings", async () => {
    const { adapter } = setup();
    const mappings = await adapter.listSymbolMappings("acct-own");
    assert.deepEqual(
      mappings.map((m) => m.brokerSymbol),
      ["EURUSD.x"],
    );
  });

  it("listSymbolMappings cannot read another trader's mappings", async () => {
    const { adapter, fake } = setup();
    assert.deepEqual(await adapter.listSymbolMappings("acct-other"), []);
    assert.ok(fake.allScoped("broker_symbol_mappings"));
    // Falling through to the legacy metadata path must not leak it either.
    assert.ok(fake.allScoped("user_broker_accounts"));
  });

  it("the legacy metadata fallback is owner-scoped too", async () => {
    const { adapter, state } = setup();
    state.mappings = [];
    state.accounts.find((r) => r.id === "acct-own")!.metadata = {
      symbol_map: { XAUUSD: "XAUUSD.x" },
    };
    state.accounts.find((r) => r.id === "acct-other")!.metadata = {
      symbol_map: { XAUUSD: "XAUUSD.pro" },
    };

    assert.deepEqual(
      (await adapter.listSymbolMappings("acct-own")).map((m) => m.brokerSymbol),
      ["XAUUSD.x"],
    );
    assert.deepEqual(await adapter.listSymbolMappings("acct-other"), []);
  });

  it("saveSymbolMapping stamps the bound owner, not the client's session", async () => {
    // The old version read `auth.getUser()` off the client — the one call here
    // that returns nothing under a service-role client. The fake has no auth at
    // all, so reaching for it would throw.
    const { adapter, state } = setup();

    const saved = await adapter.saveSymbolMapping({
      accountId: "acct-own",
      canonicalSymbol: "XAUUSD",
      brokerSymbol: "XAUUSD.x",
      assetClass: "metals",
    } as Parameters<SupabaseDatabaseAdapter["saveSymbolMapping"]>[0]);

    assert.equal(saved.brokerSymbol, "XAUUSD.x");
    assert.equal(
      state.mappings.find((m) => m.canonical_symbol === "XAUUSD")?.user_id,
      OWNER,
    );
  });

  it("every statement the adapter sends carries a user_id filter", async () => {
    // The blanket version of the cases above: whatever the adapter does, it
    // does it owner-scoped. A new method that forgets the filter fails here
    // even if nobody writes it a case of its own.
    const { adapter, fake } = setup();

    await adapter.listAccounts(OWNER);
    await adapter.getAccount("acct-own");
    await adapter.listSymbolMappings("acct-own");
    await adapter.deleteAccount("acct-own");

    assert.ok(fake.statements.length > 0, "the fake saw no statements at all");
    for (const statement of fake.statements) {
      assert.equal(
        statement.filters.user_id,
        OWNER,
        `${statement.op} on ${statement.table} went out without a user_id filter`,
      );
    }
  });
});
