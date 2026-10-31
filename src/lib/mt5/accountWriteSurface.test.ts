/**
 * TOS-SEC-2: the whole write surface of `user_broker_accounts`, in one reviewed
 * list. The companion of `ledgerWriteSurface.test.ts`, which does the same for
 * `broker_trades`.
 *
 * `syncWriteScope.test.ts` proves a fixed set of files writes this table
 * elevated and owner-scoped. What it cannot see is a write *handed off* to
 * another file. That was the state of this repo: the MT5 connect / probe
 * actions in `mt5Cloud.ts` all wrote elevated, then called
 * `syncBrokerHubFromAccountRow(supabase, …)`, which wrote the hub columns of
 * the same row on the trader's own client — without a user_id filter. The
 * chart loader did the same with the sync's symbol-resolution metadata. Every
 * connect would have half-failed the day the UPDATE grant came off, and no
 * file-list test could notice.
 *
 * Unlike the ledger, this table cannot have its grants revoked wholesale yet,
 * and this list is how you can tell. Each write is one of:
 *
 *   elevated — goes out on the service-role client; survives the revoke.
 *   owner    — the trader changing their own setting (a label, a rule, a
 *              symbol choice, deleting an account). Stays on the session client
 *              on purpose, so the revoke must leave `columns` writable.
 *   blocker  — provider/sync-owned state written on the trader's client. Has to
 *              move to the elevated client (or go away) before the revoke.
 *
 * Note what the owner entries imply: three of them write `metadata`, the same
 * jsonb column the sync writes. So the revoke TOS-SEC-2 can land is
 * column-level (provider_status, hub_*, external_connection_id, last_sync_at,
 * …), not on `metadata`, unless trading rules and the symbol map move out of it.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/mt5/accountWriteSurface.test.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const TABLE = "user_broker_accounts";

type Kind = "elevated" | "owner" | "blocker";
type Write = { op: string; receiver: string; kind: Kind; columns?: string };

const elevated = (op: string, receiver: string): Write => ({ op, receiver, kind: "elevated" });
const blocker = (op: string, receiver: string): Write => ({ op, receiver, kind: "blocker" });
const owner = (op: string, receiver: string, columns: string): Write => ({
  op,
  receiver,
  kind: "owner",
  columns,
});

/**
 * Every write to `user_broker_accounts`, in source order per file. Keyed by
 * file and position rather than line number, so editing code above a write
 * does not break the test.
 */
const EXPECTED: Record<string, { why: string; writes: Write[] }> = {
  "src/app/actions/mt5Cloud.ts": {
    why:
      "The MT5 connect / probe / test / doctor / disconnect / recover actions. " +
      "Ownership is read on the caller's client first; every write filters user_id.",
    writes: [
      elevated("update", "syncWriteClient(supabase)"),
      elevated("insert", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
      elevated("update", "syncWriteClient(supabase)"),
    ],
  },
  "src/lib/mt5/syncCloudAccount.ts": {
    why:
      "runCloudMt5Sync uses `db`, which is syncWriteClient(supabase); the " +
      "symbol-map refresh calls it inline.",
    writes: [
      elevated("update", "db"),
      elevated("update", "db"),
      elevated("update", "db"),
      elevated("update", "db"),
      elevated("update", "db"),
      elevated("update", "db"),
      elevated("update", "syncWriteClient(supabase)"),
    ],
  },
  "src/lib/mt5/persistLiveAccount.ts": {
    why: "Live equity snapshot. `writer` resolves to syncWriteClient.",
    writes: [elevated("update", "writer")],
  },
  "src/lib/broker/hub/sync.ts": {
    why:
      "Hub columns after an MT5 connect/probe. Called with the trader's client, " +
      "so it elevates itself and filters on the owner its RLS read returned.",
    writes: [elevated("update", "syncWriteClient(supabase)")],
  },
  "src/lib/broker/loadChartPageData.ts": {
    why:
      "Symbol resolution the chart discovers from the broker. Sync-owned " +
      "metadata; account came from a user_id-filtered read.",
    writes: [elevated("update", "accountWriter"), elevated("update", "accountWriter")],
  },

  "src/app/(app)/settings/actions.ts": {
    why: "The trader choosing which broker symbol a display symbol maps to.",
    writes: [owner("update", "supabase", "metadata.symbol_map")],
  },
  "src/app/actions/brokerAccounts.ts": {
    why:
      "Adding an EA-linked account by hand, and removing one with its history. " +
      "Both asked for by the owner.",
    writes: [owner("insert", "supabase", "INSERT"), owner("delete", "supabase", "DELETE")],
  },
  "src/app/api/preferences/account-rules/route.ts": {
    why: "The trader's own trading rules for an account.",
    writes: [owner("update", "supabase", "metadata.trading_rules")],
  },

  "src/app/api/broker/hub/route.ts": {
    why:
      "Takes provider_status, hub_status and metadata from the request body. " +
      "Elevating it would launder exactly the write TOS-SEC-2 exists to stop; " +
      "it needs the client-supplied status fields dropped, not a new client.",
    writes: [blocker("update", "supabase")],
  },
  "src/lib/broker/demoAccount.ts": {
    why: "Provisions the demo account with provider_status=connected on the trader's client.",
    writes: [blocker("insert", "supabase")],
  },
  "src/lib/alpaca/provision.ts": {
    why: "Alpaca paper provisioning writes provider/hub status on the trader's client.",
    writes: [blocker("update", "supabase"), blocker("insert", "supabase")],
  },
  "src/lib/broker/hub/adapters/supabaseDatabase.ts": {
    why:
      "Hub adapter persistence. saveAccount writes hub/provider columns and filters " +
      "only on id; deleteAccount is an owner action.",
    writes: [blocker("update", "supabase"), owner("delete", "supabase", "DELETE")],
  },
  "src/lib/broker/hub/adapters/alpacaLive.ts": {
    why: "disconnect() sets hub/provider status, filtered on id only.",
    writes: [blocker("update", "supabase")],
  },
  "src/lib/broker/hub/adapters/mt5BrokerApi.ts": {
    why: "disconnect() sets hub/provider status, filtered on id only.",
    writes: [blocker("update", "supabase")],
  },
  "src/lib/broker/hub/adapters/ibkrGateway.ts": {
    why: "IBKR gateway connect / sync / disconnect write provider state on the trader's client.",
    writes: [
      blocker("update", "supabase"),
      blocker("insert", "supabase"),
      blocker("update", "supabase"),
      blocker("update", "supabase"),
    ],
  },
};

/** The MT5 sync, end to end. TOS-SEC-2 prep promises all of it is elevated. */
const MT5_SYNC_PATH = [
  "src/app/actions/mt5Cloud.ts",
  "src/lib/mt5/syncCloudAccount.ts",
  "src/lib/mt5/persistLiveAccount.ts",
  "src/lib/broker/hub/sync.ts",
  "src/lib/broker/loadChartPageData.ts",
];

const isWrite = (statement: string) => /\.(update|insert|upsert|delete)\(/.exec(statement);

function candidateFiles(): string[] {
  const out = execFileSync(
    "grep",
    ["-rl", `from("${TABLE}")`, "src", "--include=*.ts", "--include=*.tsx"],
    { encoding: "utf8" },
  );
  return out
    .trim()
    .split("\n")
    .filter((f) => f && !f.includes(".test."))
    .sort();
}

/** The expression immediately before `.from("user_broker_accounts")`. */
function receiverBefore(code: string, at: number): string {
  const before = code.slice(Math.max(0, at - 200), at).replace(/\s+$/, "");
  const match = /([A-Za-z_$][\w$]*(?:\([A-Za-z_$][\w$]*\))?)$/.exec(before);
  return match ? match[1] : "?";
}

function actualWrites(): Record<string, { op: string; receiver: string }[]> {
  const found: Record<string, { op: string; receiver: string }[]> = {};
  const marker = `.from("${TABLE}")`;

  for (const file of candidateFiles()) {
    const code = readFileSync(file, "utf8");
    let at = code.indexOf(marker);
    while (at !== -1) {
      const end = code.indexOf(";", at);
      const op = isWrite(code.slice(at, end === -1 ? code.length : end));
      if (op) (found[file] ??= []).push({ op: op[1], receiver: receiverBefore(code, at) });
      at = code.indexOf(marker, at + marker.length);
    }
  }
  return found;
}

const describeWrites = (writes: { op: string; receiver: string }[]) =>
  writes.map((w) => `${w.op} on ${w.receiver}`).join(", ");

describe("user_broker_accounts write surface", () => {
  const found = actualWrites();

  it("has no account write that is not in the reviewed list", () => {
    const unlisted: string[] = [];
    for (const [file, writes] of Object.entries(found)) {
      const expected = EXPECTED[file];
      if (!expected) {
        unlisted.push(`${file}: ${describeWrites(writes)}`);
      } else if (writes.length !== expected.writes.length) {
        unlisted.push(
          `${file}: found ${writes.length} write(s) (${describeWrites(writes)}), ` +
            `the list describes ${expected.writes.length}`,
        );
      }
    }

    assert.deepEqual(
      unlisted,
      [],
      `A write to ${TABLE} appeared that nobody has reasoned about.\n\n` +
        unlisted.join("\n") +
        `\n\nIf it is provider or sync state, route it through syncWriteClient(supabase), ` +
        `filter it on user_id, and list it as elevated. If it is the trader editing ` +
        `their own setting, list it as owner and name the column.`,
    );
  });

  it("every listed write still goes out on the client the list claims", () => {
    for (const [file, { why, writes: expected }] of Object.entries(EXPECTED)) {
      const writes = found[file];
      assert.ok(writes, `${file}: the list expects account writes here, the scan found none`);

      for (const [index, want] of expected.entries()) {
        const got = writes[index];
        assert.ok(got, `${file}: expected a ${want.op} write at position ${index}`);
        assert.equal(got.op, want.op, `${file}: write ${index} is a ${got.op}, the list says ${want.op}`);
        assert.equal(
          got.receiver,
          want.receiver,
          `${file}: write ${index} (${got.op}) now goes out on \`${got.receiver}\`, ` +
            `the list says \`${want.receiver}\`. ${why} — if it moved to the elevated ` +
            `client, mark it elevated here; that is one blocker fewer.`,
        );
      }
    }
  });

  it("the MT5 sync path writes nothing on the trader's own client", () => {
    const sessionWrites = MT5_SYNC_PATH.flatMap((file) =>
      (EXPECTED[file]?.writes ?? [])
        .filter((w) => w.kind !== "elevated")
        .map((w) => `${file}: ${w.op} on ${w.receiver} (${w.kind})`),
    );
    assert.deepEqual(sessionWrites, [], "TOS-SEC-2 prep: the MT5 sync must survive the revoke");

    for (const file of MT5_SYNC_PATH) {
      for (const w of found[file] ?? []) {
        assert.notEqual(w.receiver, "supabase", `${file}: ${w.op} went back to the trader's client`);
      }
    }
  });

  it("the elevated label is never on a bare session client", () => {
    // `elevated` on a receiver named `supabase` would be a claim the code does
    // not back up. (The ledger list has one documented exception, a cron-only
    // parameter; this table has none.)
    for (const [file, { writes }] of Object.entries(EXPECTED)) {
      for (const w of writes) {
        if (w.kind === "elevated") assert.notEqual(w.receiver, "supabase", `${file}: ${w.op}`);
        if (w.kind !== "elevated") assert.equal(w.receiver, "supabase", `${file}: ${w.op}`);
        if (w.kind === "owner") assert.ok(w.columns, `${file}: owner write must name its column`);
      }
    }
  });

  it("the scan finds writes at all", () => {
    const total = Object.values(found).reduce((n, w) => n + w.length, 0);
    assert.ok(total >= 30, `expected to find the known account writes, found ${total}`);
    assert.ok(found["src/app/actions/mt5Cloud.ts"], "the scan missed the MT5 actions — it is broken");
  });

  it("the receiver parser reads the forms this table is written with", () => {
    const cases: [string, string][] = [
      ['await supabase\n    .from("user_broker_accounts")\n    .update(p);', "supabase"],
      ['await syncWriteClient(supabase)\n    .from("user_broker_accounts")\n    .update(p);', "syncWriteClient(supabase)"],
      ['await this.supabase\n      .from("user_broker_accounts")\n      .delete();', "supabase"],
      ['void accountWriter\n      .from("user_broker_accounts")\n      .update(p);', "accountWriter"],
    ];
    for (const [code, want] of cases) {
      assert.equal(receiverBefore(code, code.indexOf('.from("user_broker_accounts")')), want);
    }
  });
});
