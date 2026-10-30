/**
 * TOS-SEC-2 prep: an RLS-bypassing write must still be owner-scoped.
 *
 * The MT5 sync now writes `broker_trades`, `mt5_positions` and
 * `user_broker_accounts` through the service-role client, so that a trader's
 * own INSERT/UPDATE grants on those tables can be revoked. Revoking them is
 * the point — a trader who can write `broker_trades` directly can rewrite the
 * P&L ledger AXE scores them on.
 *
 * But the service-role client bypasses Row Level Security, which is what used
 * to make "you can only touch your own rows" true. That guarantee now rests on
 * two things the code must do, and neither is checked by the type system:
 *
 *   1. Ownership is proven first, by reading the account through the caller's
 *      own RLS-scoped client and returning early if it comes back empty.
 *   2. Every elevated write still filters on `user_id`.
 *
 * A reviewer adding one more `.update({...}).eq("id", accountId)` would undo
 * rule 2 silently: it works, it passes every other test, and it is a
 * cross-tenant write the day the grants come off. So this test reads the source
 * and refuses that shape. It is deliberately a source-level check — there is no
 * runtime seam that could observe a missing filter.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/mt5/syncWriteScope.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const OWNER_SCOPED_TABLES = ["user_broker_accounts", "broker_trades", "mt5_positions"];

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

/**
 * Split a file into the statements that touch a table, each one running from
 * `.from("<table>")` up to the terminating semicolon.
 */
function tableStatements(code: string, table: string): string[] {
  const statements: string[] = [];
  const marker = `.from("${table}")`;
  let at = code.indexOf(marker);
  while (at !== -1) {
    const end = code.indexOf(";", at);
    statements.push(code.slice(at, end === -1 ? code.length : end));
    at = code.indexOf(marker, at + marker.length);
  }
  return statements;
}

const isWrite = (statement: string) =>
  /\.(update|insert|upsert|delete)\(/.test(statement);

/**
 * An insert does not filter on anything — it carries `user_id` in its payload.
 * The payload is usually built a few lines up and passed by name, so follow the
 * name to its definition before deciding the write is unscoped.
 */
function insertPayloadCarriesUser(code: string, statement: string): boolean {
  const byName = /\.insert\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(statement);
  if (!byName) return false;
  const definition = new RegExp(`const ${byName[1]}\\s*=([\\s\\S]*?);`).exec(code);
  if (!definition) return false;
  return /user_id|userId/.test(definition[1]);
}

/**
 * A write that still goes out on the caller's own client, e.g.
 * `await supabase.from("user_broker_accounts").update(...)`. Once the trader's
 * grants are revoked that write is rejected, so it has to be found now.
 */
function userClientWrites(code: string, table: string): string[] {
  const shape = new RegExp(
    `(?:await|=)\\s*supabase\\s*\\.from\\("${table}"\\)\\s*\\.(?:update|insert|upsert|delete)\\(`,
    "g",
  );
  return code.match(shape) ?? [];
}

const SCOPED_FILES = [
  "src/lib/mt5/syncCloudAccount.ts",
  "src/lib/mt5/persistLiveAccount.ts",
  // The connect / probe / test / doctor / disconnect / recover actions write
  // the same account rows, so the same two rules apply to them.
  "src/app/actions/mt5Cloud.ts",
];

describe("MT5 sync write scoping", () => {
  for (const file of SCOPED_FILES) {
    it(`${file} scopes every write to the owning user`, () => {
      const code = source(file);
      let checked = 0;

      for (const table of OWNER_SCOPED_TABLES) {
        for (const statement of tableStatements(code, table)) {
          if (!isWrite(statement)) continue;
          checked += 1;

          const scoped =
            /\.eq\("user_id",/.test(statement) ||
            /user_id:/.test(statement) ||
            insertPayloadCarriesUser(code, statement);

          assert.ok(
            scoped,
            `${file}: write to ${table} is not scoped by user_id — a service-role ` +
              `client would let this reach another trader's rows.\n\n${statement.trim()}`,
          );
        }
      }

      assert.ok(checked > 0, `${file}: found no writes to scope — did the tables get renamed?`);
    });
  }

  it("proves ownership with the caller's own client before elevating", () => {
    const code = source("src/lib/mt5/syncCloudAccount.ts");

    // The gating reads must use `supabase` (the caller's RLS-scoped client),
    // not the elevated one, or rule 1 is not actually established.
    const gatingReads = tableStatements(code, "user_broker_accounts").filter(
      (s) => /\.select\(/.test(s) && /external_connection_id/.test(s),
    );
    assert.equal(gatingReads.length, 2, "expected one gating read per exported sync function");
    for (const read of gatingReads) {
      assert.match(read, /\.eq\("user_id",/);
    }
    for (const marker of ["await supabase\n    .from(\"user_broker_accounts\")"]) {
      assert.ok(code.includes(marker), "the gating read no longer uses the caller's client");
    }
  });

  it("routes sync writes through the shared elevated client", () => {
    const code = source("src/lib/mt5/syncCloudAccount.ts");
    assert.match(code, /import \{ syncWriteClient \} from "@\/lib\/supabase\/syncWriteClient"/);
    assert.match(code, /const db = syncWriteClient\(supabase\)/);

    // axe_proactive_events has a SELECT policy only. A closed-trade alert
    // written with the caller's client is rejected on the server-action path,
    // and the trader hears nothing.
    assert.match(code, /recordProactiveFeedEvent\(\s*db,/);
    assert.doesNotMatch(code, /recordProactiveFeedEvent\(\s*supabase,/);

    // persistLiveAccount had its own private copy of this resolver; one shared
    // helper means one place documents why the writes are safe.
    const persist = source("src/lib/mt5/persistLiveAccount.ts");
    assert.match(persist, /syncWriteClient/);
    assert.ok(
      !/createServiceRoleSupabaseClient\(\) \?\? supabase/.test(persist),
      "persistLiveAccount still resolves its own writer instead of sharing one",
    );
  });

  for (const file of SCOPED_FILES) {
    it(`${file} writes no owner-scoped table on the caller's own client`, () => {
      const code = source(file);
      for (const table of OWNER_SCOPED_TABLES) {
        assert.deepEqual(
          userClientWrites(code, table),
          [],
          `${file}: a write to ${table} still uses the trader's client — it breaks the day ` +
            `those grants are revoked. Route it through syncWriteClient(supabase).`,
        );
      }
    });
  }

  it("the user-client detector actually detects one", () => {
    // Guards the regex above: a check that can never fail proves nothing.
    const bad = 'await supabase\n  .from("broker_trades")\n  .update({ pnl: 0 })';
    assert.equal(userClientWrites(bad, "broker_trades").length, 1);
    const good = 'await syncWriteClient(supabase)\n  .from("broker_trades")\n  .update({ pnl: 0 })';
    assert.equal(userClientWrites(good, "broker_trades").length, 0);
  });
});
