/**
 * TOS-SEC-2: the whole write surface of the P&L ledger, in one reviewed list.
 *
 * `syncWriteScope.test.ts` proves the three MT5 sync files write
 * `broker_trades` elevated and owner-scoped. It cannot prove the thing the
 * revoke actually depends on, because it only looks at those three files: that
 * *nothing else in the app* still writes the ledger on the trader's own client.
 * One such write anywhere means the INSERT/UPDATE grant cannot come off, and
 * the way you find out is a trader closing a position and the trade vanishing.
 *
 * That is not hypothetical — it was the state of this repo. `/api/mt5/order`'s
 * close path wrote the ledger with the caller's session client, while the cron
 * that closes the same position on a stop already used the service-role client.
 * The identical event was revocable one way and not the other, and no test
 * covering the three sync files could see it.
 *
 * So this scans `src` instead of a file list, and compares what it finds
 * against the table below. A new ledger write fails this test with the reason
 * why. The fix is normally one line — `syncWriteClient(supabase)` instead of
 * `supabase` — plus an entry here saying which client it goes out on and why.
 * An inventory someone has to edit on purpose is the point: "can we revoke the
 * grant?" becomes a list you can read rather than a regex's opinion.
 *
 * Whole suite: npm test
 * This file only: node --import ./scripts/bundler-resolve.mjs --test src/lib/mt5/ledgerWriteSurface.test.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const LEDGER = "broker_trades";

/**
 * Every write to `broker_trades` in the app, and the client it goes out on.
 *
 * `elevated` means it survives the day a trader's INSERT/UPDATE grant on the
 * ledger is revoked. Keyed by file and operation rather than line number, so
 * editing the code above a write does not break the test.
 */
const EXPECTED: Record<string, { op: string; receiver: string; elevated: boolean; why: string }[]> =
  {
    "src/lib/mt5/syncCloudAccount.ts": [
      {
        op: "update",
        receiver: "db",
        elevated: true,
        why: "`db` is syncWriteClient(supabase); the broker sync owns the ledger.",
      },
      {
        op: "insert",
        receiver: "db",
        elevated: true,
        why: "Same client. Payload carries user_id, so the insert is owner-scoped.",
      },
    ],
    "src/services/paperOrderService.ts": [
      {
        op: "upsert",
        receiver: "syncWriteClient(supabase)",
        elevated: true,
        why:
          "A practice position closed by hand. Ownership is proven by the " +
          "paper_positions read above it, which filters user_id and returns " +
          "position_not_found when empty.",
      },
    ],
    "src/services/paperStopWatcher.ts": [
      {
        op: "upsert",
        receiver: "supabase",
        elevated: true,
        why:
          "The same close, fired by a stop. Only reachable from " +
          "/api/cron/paper-stops, which refuses to run without a service-role " +
          "client (503 supabase_service_role_missing), so the parameter is " +
          "never a session client.",
      },
    ],
    "src/app/actions/brokerAccounts.ts": [
      {
        op: "delete",
        receiver: "supabase",
        elevated: false,
        why:
          "Removing an account and its history, asked for by the owner. DELETE " +
          "is a separate grant from INSERT/UPDATE and is not what TOS-SEC-2 " +
          "revokes — a trader deleting their own account's trades is visible " +
          "and intended, where silently rewriting a pnl is neither.",
      },
    ],
  };

const isWrite = (statement: string) => /\.(update|insert|upsert|delete)\(/.exec(statement);

/** Files that mention the ledger at all, so the scan does not read all of src. */
function candidateFiles(): string[] {
  const out = execFileSync(
    "grep",
    ["-rl", `from("${LEDGER}")`, "src", "--include=*.ts", "--include=*.tsx"],
    { encoding: "utf8" },
  );
  return out
    .trim()
    .split("\n")
    .filter((f) => f && !f.includes(".test."))
    .sort();
}

/**
 * The receiver a write goes out on: the expression immediately before
 * `.from("broker_trades")`. `await db\n  .from(...)` gives `db`,
 * `await syncWriteClient(supabase)\n  .from(...)` gives the call.
 */
function receiverBefore(code: string, at: number): string {
  const before = code.slice(Math.max(0, at - 200), at).replace(/\s+$/, "");
  const match = /([A-Za-z_$][\w$]*(?:\([A-Za-z_$][\w$]*\))?)$/.exec(before);
  return match ? match[1] : "?";
}

function actualWrites(): Record<string, { op: string; receiver: string }[]> {
  const found: Record<string, { op: string; receiver: string }[]> = {};
  const marker = `.from("${LEDGER}")`;

  for (const file of candidateFiles()) {
    const code = readFileSync(file, "utf8");
    let at = code.indexOf(marker);
    while (at !== -1) {
      const end = code.indexOf(";", at);
      const statement = code.slice(at, end === -1 ? code.length : end);
      const op = isWrite(statement);
      if (op) {
        (found[file] ??= []).push({ op: op[1], receiver: receiverBefore(code, at) });
      }
      at = code.indexOf(marker, at + marker.length);
    }
  }
  return found;
}

describe("broker_trades write surface", () => {
  const found = actualWrites();

  it("has no ledger write that is not in the reviewed list", () => {
    const unlisted: string[] = [];
    for (const [file, writes] of Object.entries(found)) {
      const expected = EXPECTED[file];
      if (!expected) {
        unlisted.push(`${file}: ${writes.map((w) => w.op).join(", ")}`);
        continue;
      }
      if (writes.length !== expected.length) {
        unlisted.push(
          `${file}: found ${writes.length} write(s) (${writes
            .map((w) => `${w.op} on ${w.receiver}`)
            .join(", ")}), the list describes ${expected.length}`,
        );
      }
    }

    assert.deepEqual(
      unlisted,
      [],
      `A write to ${LEDGER} appeared that nobody has reasoned about.\n\n` +
        unlisted.join("\n") +
        `\n\nRoute it through syncWriteClient(supabase) and add it to EXPECTED ` +
        `in this file with the reason. If it genuinely has to go out on the ` +
        `trader's own client, say so there — that is a decision to make in the ` +
        `open, because it keeps the ledger grant in place.`,
    );
  });

  it("every listed write still goes out on the client the list claims", () => {
    for (const [file, expected] of Object.entries(EXPECTED)) {
      const writes = found[file];
      assert.ok(writes, `${file}: the list expects ledger writes here, the scan found none`);

      for (const [index, want] of expected.entries()) {
        const got = writes[index];
        assert.ok(got, `${file}: expected a ${want.op} write at position ${index}`);
        assert.equal(
          got.op,
          want.op,
          `${file}: write ${index} is a ${got.op}, the list says ${want.op}`,
        );
        assert.equal(
          got.receiver,
          want.receiver,
          `${file}: write ${index} (${got.op}) now goes out on \`${got.receiver}\`, ` +
            `the list says \`${want.receiver}\`. ${want.why}`,
        );
      }
    }
  });

  it("the ledger is revocable: no INSERT/UPDATE/UPSERT on a session client", () => {
    const sessionWrites = Object.entries(EXPECTED).flatMap(([file, writes]) =>
      writes
        .filter((w) => !w.elevated && w.op !== "delete")
        .map((w) => `${file}: ${w.op} on ${w.receiver}`),
    );

    assert.deepEqual(
      sessionWrites,
      [],
      `These writes break the day the trader's INSERT/UPDATE grant on ${LEDGER} ` +
        `is revoked, which is what TOS-SEC-2 is for:\n${sessionWrites.join("\n")}`,
    );
  });

  it("the scan finds writes at all", () => {
    // A scanner whose grep silently returns nothing would pass every assertion
    // above while checking nothing.
    const total = Object.values(found).reduce((n, w) => n + w.length, 0);
    assert.ok(total >= 5, `expected to find the known ledger writes, found ${total}`);
    assert.ok(
      found["src/lib/mt5/syncCloudAccount.ts"],
      "the broker sync writes the ledger — if the scan missed it, the scan is broken",
    );
  });

  it("the receiver parser tells an elevated write from a session one", () => {
    // Guards `receiverBefore`: if it returned "?" for everything, the receiver
    // assertions above would compare "?" to "?" and never fail.
    const session = 'await supabase\n    .from("broker_trades")\n    .insert(row);';
    assert.equal(receiverBefore(session, session.indexOf('.from("broker_trades")')), "supabase");

    const elevated = 'await syncWriteClient(supabase)\n    .from("broker_trades")\n    .insert(row);';
    assert.equal(
      receiverBefore(elevated, elevated.indexOf('.from("broker_trades")')),
      "syncWriteClient(supabase)",
    );
  });
});
