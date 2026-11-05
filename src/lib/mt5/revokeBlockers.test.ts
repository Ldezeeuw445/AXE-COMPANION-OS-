/**
 * TOS-SEC-2: what still stands between here and revoking the write grants.
 *
 * `syncWriteScope.test.ts` proves the MT5 sync path writes elevated and
 * owner-scoped. It checks a fixed list of five files, which is the right
 * question for that path and the wrong question for the revoke: the grant is
 * held by the *role*, so it can only come off when nothing anywhere relies on
 * it. A write added in a sixth file is invisible to that test.
 *
 * So this one scans all of `src` instead, finds every write to the three
 * owner-scoped tables, and separates the ones going out on the trader's own
 * client from the ones going out elevated. The trader-client writes are the
 * revoke blockers, and they are pinned below with the reason each is still
 * there. Two things follow:
 *
 *   - `broker_trades` is at zero. That is the table that matters most — it is
 *     the P&L ledger AXE scores traders on, so a trader who can write it can
 *     rewrite their own score. Its INSERT/UPDATE/UPSERT grant is revocable
 *     today, and this test fails if a new write puts it back.
 *   - `user_broker_accounts` is not, and the entries below say why. They are
 *     user-initiated edits (naming an account, saving risk rules, mapping a
 *     symbol), not background-job writes. Revoking that grant means moving
 *     each one, which is a separate change from this prep.
 *
 * A failure here is not necessarily a bug. It means the inventory moved: either
 * a write was added, in which case decide which column it belongs in, or one
 * was removed, in which case delete its line and the revoke got closer.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/mt5/revokeBlockers.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, it } from "node:test";

const OWNER_SCOPED_TABLES = ["broker_trades", "mt5_positions", "user_broker_accounts"] as const;

const SRC = resolve(process.cwd(), "src");

/**
 * Files whose `supabase` parameter is always a service-role client, because
 * every caller hands them one. A source scan cannot see that — the variable is
 * named the same either way — so it is asserted separately in
 * `serviceRoleOnlyEntryPoints` below rather than taken on trust.
 */
const SERVICE_ROLE_ONLY: Record<string, { calledFrom: string; why: string }> = {
  "services/paperStopWatcher.ts": {
    calledFrom: "src/app/api/cron/paper-stops/route.ts",
    why: "cron-only sweep; the route 503s when no service-role key is configured",
  },
};

/**
 * Every trader-client write left, as `file -> table -> count`.
 *
 * Each entry is a grant that cannot come off yet. The reason is what someone
 * reading this during the revoke needs: not what the code does, but why it is
 * still the trader doing the writing.
 */
const REVOKE_BLOCKERS: Record<string, { tables: Record<string, number>; why: string }> = {
  "app/(app)/settings/actions.ts": {
    tables: { user_broker_accounts: 1 },
    why: "adding a watchlist symbol caches its broker mapping on the account's metadata",
  },
  "app/actions/brokerAccounts.ts": {
    tables: { broker_trades: 1, user_broker_accounts: 2 },
    why:
      "the trader adding and removing their own account. The broker_trades write is the " +
      "DELETE that clears the removed account's history, so revoking INSERT/UPDATE on " +
      "that table does not break it — revoking DELETE would",
  },
  "app/api/broker/hub/route.ts": {
    tables: { user_broker_accounts: 1 },
    why: "the hub panel writing back provider/hub status after a reconnect",
  },
  "app/api/preferences/account-rules/route.ts": {
    tables: { user_broker_accounts: 1 },
    why: "saving per-account risk rules into metadata",
  },
  "lib/alpaca/provision.ts": {
    tables: { user_broker_accounts: 2 },
    why: "provisioning an Alpaca paper account creates and then updates the trader's row",
  },
  "lib/broker/demoAccount.ts": {
    tables: { user_broker_accounts: 1 },
    why: "first visit creates the built-in demo account row",
  },
  "lib/broker/hub/adapters/alpacaLive.ts": {
    tables: { user_broker_accounts: 1 },
    why: "marks the account disconnected when Alpaca rejects the stored keys",
  },
  "lib/broker/hub/adapters/ibkrGateway.ts": {
    tables: { user_broker_accounts: 4 },
    why: "IBKR gateway pairing writes session state onto the account row",
  },
  "lib/broker/hub/adapters/mt5BrokerApi.ts": {
    tables: { user_broker_accounts: 1 },
    why: "marks the account disconnected when MetaApi reports the login is gone",
  },
  "lib/broker/hub/adapters/supabaseDatabase.ts": {
    tables: { user_broker_accounts: 2 },
    why:
      "the hub's generic save/delete. Takes whichever client its caller built, and filters " +
      "on id alone — so it must stay on the trader's client until it filters user_id too",
  },
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      found.push(path);
    }
  }
  return found;
}

/** Statement from `.from("<table>")` to the terminating semicolon. */
function tableStatements(code: string, table: string): { at: number; text: string }[] {
  const statements: { at: number; text: string }[] = [];
  const marker = `.from("${table}")`;
  let at = code.indexOf(marker);
  while (at !== -1) {
    const end = code.indexOf(";", at);
    statements.push({ at, text: code.slice(at, end === -1 ? code.length : end) });
    at = code.indexOf(marker, at + marker.length);
  }
  return statements;
}

const isWrite = (statement: string) => /\.(update|insert|upsert|delete)\(/.test(statement);

/**
 * The names in this file that hold an elevated client, so `db.from(...)` can be
 * told apart from `supabase.from(...)`.
 *
 * Two kinds of indirection are real in this codebase and both are resolved:
 *
 *   - An alias. `persistLiveAccount.ts` does `const writerFor = syncWriteClient`
 *     and calls `writerFor(supabase)`, so the factory is not always spelled
 *     `syncWriteClient`.
 *   - A hand-off. The same file resolves `const writer = writerFor(supabase)`
 *     and passes it into `replaceMt5Positions(writer, …)`, where it arrives as a
 *     parameter. Following that properly needs dataflow; instead a name this
 *     file binds to an elevated client is treated as elevated anywhere in the
 *     file, which is the reading a reviewer would give it. `syncWriteScope.test.ts`
 *     is what independently holds those writes to filtering on `user_id`.
 *
 * Only `syncWriteClient` counts as the factory, not a bare
 * `createServiceRoleSupabaseClient()`. A write built on one of those directly
 * would land in the inventory below as a blocker it is not — a false positive
 * rather than a missed grant, and the direction to be wrong in.
 */
function elevatedNames(code: string): { factories: string[]; names: Set<string> } {
  const factories = new Set(["syncWriteClient"]);
  for (const match of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*syncWriteClient\s*;/g)) {
    factories.add(match[1]);
  }

  const names = new Set<string>();
  for (const factory of factories) {
    const binding = new RegExp(`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${factory}\\(`, "g");
    for (const match of code.matchAll(binding)) names.add(match[1]);
  }
  return { factories: [...factories], names };
}

/**
 * The expression `.from(...)` was called on: the text immediately before the
 * match, back to whatever delimits it. `await db\n  .from("x")` yields `db`.
 */
function receiver(code: string, at: number): string {
  const before = code.slice(Math.max(0, at - 120), at);
  const match = /([A-Za-z_$][\w$.]*(?:\([^()]*\))?)\s*$/.exec(before.replace(/\s+/g, " "));
  return match ? match[1] : "";
}

/** Trader-client writes in one file, as `table -> count`. */
function traderClientWrites(code: string): Record<string, number> {
  const { factories, names } = elevatedNames(code);
  const counts: Record<string, number> = {};

  const isElevated = (on: string) =>
    names.has(on) || factories.some((factory) => on.startsWith(`${factory}(`));

  for (const table of OWNER_SCOPED_TABLES) {
    for (const { at, text } of tableStatements(code, table)) {
      if (!isWrite(text)) continue;
      if (isElevated(receiver(code, at))) continue;
      counts[table] = (counts[table] ?? 0) + 1;
    }
  }
  return counts;
}

/** `relative-path -> table -> count`, for every file that has such a write. */
function scanRepo(): Record<string, Record<string, number>> {
  const found: Record<string, Record<string, number>> = {};
  for (const file of sourceFiles(SRC)) {
    const key = relative(SRC, file).split(sep).join("/");
    if (key in SERVICE_ROLE_ONLY) continue;
    const counts = traderClientWrites(readFileSync(file, "utf8"));
    if (Object.keys(counts).length > 0) found[key] = counts;
  }
  return found;
}

describe("TOS-SEC-2 revoke blockers", () => {
  const found = scanRepo();

  it("the trader-client inventory is exactly what is documented above", () => {
    const expected = Object.fromEntries(
      Object.entries(REVOKE_BLOCKERS).map(([file, entry]) => [file, entry.tables]),
    );
    assert.deepEqual(
      found,
      expected,
      "the set of trader-client writes to an owner-scoped table changed.\n\n" +
        `found:\n${JSON.stringify(found, null, 2)}\n\n` +
        "Add it to REVOKE_BLOCKERS with the reason it is not elevated, route it " +
        "through syncWriteClient(supabase), or delete its line if it is gone.",
    );
  });

  it("nothing writes broker_trades on the trader's client except the account-removal delete", () => {
    const writers = Object.entries(found)
      .filter(([, tables]) => tables.broker_trades)
      .map(([file]) => file);

    assert.deepEqual(
      writers,
      ["app/actions/brokerAccounts.ts"],
      "broker_trades is the P&L ledger AXE scores traders on. Every write to it goes out " +
        "elevated, so its INSERT/UPDATE/UPSERT grant is revocable; the one exception is the " +
        "DELETE that clears a removed account's history.",
    );

    // Specifically: that one is a DELETE, so revoking INSERT/UPDATE leaves it working.
    const code = readFileSync(resolve(SRC, "app/actions/brokerAccounts.ts"), "utf8");
    const writes = tableStatements(code, "broker_trades").filter(({ text }) => isWrite(text));
    assert.equal(writes.length, 1);
    assert.match(writes[0].text, /\.delete\(\)/);
    assert.match(writes[0].text, /\.eq\("user_id",/);
  });

  it("mt5_positions is written only by the elevated sync", () => {
    const writers = Object.entries(found)
      .filter(([, tables]) => tables.mt5_positions)
      .map(([file]) => file);
    assert.deepEqual(writers, [], "mt5_positions is written by persistLiveAccount, elevated");
  });

  it("the files trusted as service-role-only really are called that way", () => {
    for (const [file, { calledFrom }] of Object.entries(SERVICE_ROLE_ONLY)) {
      const caller = readFileSync(resolve(process.cwd(), calledFrom), "utf8");
      assert.match(
        caller,
        /createServiceRoleSupabaseClient\(\)/,
        `${calledFrom} no longer builds a service-role client, so ${file} cannot be trusted ` +
          "to receive one — it needs to be in REVOKE_BLOCKERS instead",
      );
      // And it must refuse to run rather than fall back to a weaker client.
      assert.match(
        caller,
        /supabase_service_role_missing|if \(!supabase\)/,
        `${calledFrom} must fail closed when no service-role key is configured`,
      );
    }
  });

  it("the receiver parser tells an elevated write from a trader one", () => {
    // Guards the scan: an inventory built by a broken parser proves nothing.
    const trader = 'await supabase\n  .from("broker_trades")\n  .upsert(row);';
    assert.deepEqual(traderClientWrites(trader), { broker_trades: 1 });

    const inline = 'await syncWriteClient(supabase)\n  .from("broker_trades")\n  .upsert(row);';
    assert.deepEqual(traderClientWrites(inline), {});

    const bound = 'const db = syncWriteClient(supabase);\nawait db\n  .from("broker_trades")\n  .upsert(row);';
    assert.deepEqual(traderClientWrites(bound), {});

    // The alias and hand-off shapes persistLiveAccount.ts actually uses.
    const aliased =
      "const writerFor = syncWriteClient;\n" +
      'const writer = writerFor(supabase);\nawait writer\n  .from("mt5_positions")\n  .insert(rows);';
    assert.deepEqual(traderClientWrites(aliased), {});

    // An alias must not whitelist a name this file never bound.
    const unbound = 'const writerFor = syncWriteClient;\nawait other\n  .from("mt5_positions")\n  .insert(rows);';
    assert.deepEqual(traderClientWrites(unbound), { mt5_positions: 1 });

    // A read is not a write.
    const read = 'await supabase\n  .from("broker_trades")\n  .select("id");';
    assert.deepEqual(traderClientWrites(read), {});
  });
});
