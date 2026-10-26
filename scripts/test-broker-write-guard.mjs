/**
 * TOS-SEC-2 — repo-wide guard: no session-client writes on the broker tables.
 * Run: npm run test:broker-write-guard
 *
 * `test-mt5-sync-write-client.mjs` proves the resolver fails closed, but its
 * static scan only covered a hand-listed set of files, so a brand-new file
 * doing `supabase.from("user_broker_accounts").update(...)` passed the suite
 * and would then fail in production once ops applies
 * `20260705120000_tos_sec2_broker_tables_select_only.sql`.
 *
 * This test discovers every file under `src/` itself, so the invariant holds
 * for code that does not exist yet.
 * No secrets / no network / no production data.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BROKER_TABLES,
  MUTATION_VERBS,
  formatHits,
  isApprovedWriteReceiver,
  scanSource,
  scanTree,
} from "./lib/brokerWriteScan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/* ── 1. The classifier itself ─────────────────────────────────────── */

// Session write across lines (the shape used throughout the codebase).
const sessionWrite = scanSource(
  [
    "await supabase",
    '  .from("user_broker_accounts")',
    '  .update({ provider_status: "syncing" })',
    '  .eq("user_id", userId);',
  ].join("\n"),
  "fixture.ts",
);
assert.equal(sessionWrite.writes.length, 1);
assert.equal(sessionWrite.writes[0].receiver, "supabase");
assert.equal(sessionWrite.writes[0].verb, "update");
assert.equal(sessionWrite.unclassified.length, 0);
assert.equal(isApprovedWriteReceiver(sessionWrite.writes[0].receiver), false);

// Service-role write is accepted, including via a dotted gate object.
for (const receiver of ["writeSb", "writeGate.writeSb", "this.writeClient"]) {
  const ok = scanSource(
    `await ${receiver}.from("broker_trades").insert(payload);`,
    "fixture.ts",
  );
  assert.equal(ok.writes.length, 1, `${receiver} should parse as one write`);
  assert.equal(
    isApprovedWriteReceiver(ok.writes[0].receiver),
    true,
    `${receiver} should count as a service-role client`,
  );
}

// Allowlist, not denylist: a write through any other client name is a
// violation, so renaming the session variable cannot sneak a write through.
for (const receiver of ["db", "sb", "client", "adminIsh"]) {
  const hit = scanSource(
    `await ${receiver}.from("user_broker_accounts").delete().eq("id", id);`,
    "fixture.ts",
  );
  assert.equal(hit.writes.length, 1);
  assert.equal(
    isApprovedWriteReceiver(hit.writes[0].receiver),
    false,
    `${receiver} must not be accepted as a service-role client`,
  );
}

// Reads on the session client stay legal — RLS keeps SELECT-own.
const read = scanSource(
  'const { data } = await supabase.from("broker_trades").select("id").eq("user_id", u);',
  "fixture.ts",
);
assert.equal(read.writes.length, 0);
assert.equal(read.reads.length, 1);
assert.equal(read.reads[0].verb, "select");

// Every mutation verb is caught, not just update.
for (const verb of MUTATION_VERBS) {
  const hit = scanSource(
    `await supabase.from("broker_trades").${verb}(payload);`,
    "fixture.ts",
  );
  assert.equal(hit.writes.length, 1, `${verb} must be detected`);
  assert.equal(hit.writes[0].verb, verb);
}

// Unrelated tables are ignored.
const other = scanSource(
  'await supabase.from("user_workspace_preferences").upsert(row);',
  "fixture.ts",
);
assert.equal(other.writes.length, 0);
assert.equal(other.reads.length, 0);
assert.equal(other.unclassified.length, 0);

// Fail-closed: an unparseable chain is surfaced, never treated as safe.
const weird = scanSource('wrap(supabase).from("broker_trades")', "fixture.ts");
assert.equal(weird.writes.length, 0);
assert.equal(weird.unclassified.length, 1);

/* ── 2. The real tree ─────────────────────────────────────────────── */

const scan = scanTree(join(root, "src"), root);

assert.ok(scan.files > 100, `expected a full src scan, saw ${scan.files} files`);
assert.ok(
  scan.writes.length > 0,
  "scanner found no broker-table writes at all — the pattern likely broke",
);

assert.equal(
  scan.unclassified.length,
  0,
  `TOS-SEC-2: unparseable broker-table access (classify or rewrite):\n${formatHits(
    scan.unclassified,
  )}`,
);

assert.equal(
  scan.violations.length,
  0,
  "TOS-SEC-2: broker-table writes must use the service-role write client " +
    `(resolveMt5SyncWriteClient), not the user session client:\n${formatHits(
      scan.violations,
    )}\n` +
    "Once the SELECT-only migration is applied these fail at runtime.",
);

// Both tables must actually be covered, so a renamed table cannot silently
// empty the scan.
for (const table of BROKER_TABLES) {
  assert.ok(
    scan.writes.some((w) => w.table === table),
    `expected at least one guarded write on ${table}`,
  );
}

/**
 * The automatic scan must stay at least as broad as the hand-maintained list
 * in test-mt5-sync-write-client.mjs — otherwise this test would be a weaker
 * replacement for it rather than a stronger one.
 */
const PREVIOUSLY_LISTED_WRITE_FILES = [
  "src/app/(app)/settings/actions.ts",
  "src/app/actions/brokerAccounts.ts",
  "src/app/actions/mt5Cloud.ts",
  "src/app/api/broker/hub/route.ts",
  "src/lib/alpaca/provision.ts",
  "src/lib/broker/demoAccount.ts",
  "src/lib/broker/hub/adapters/alpacaLive.ts",
  "src/lib/broker/hub/adapters/ibkrGateway.ts",
  "src/lib/broker/hub/adapters/mt5BrokerApi.ts",
  "src/lib/broker/hub/adapters/supabaseDatabase.ts",
  "src/lib/broker/hub/sync.ts",
  "src/lib/broker/loadChartPageData.ts",
  "src/lib/mt5/syncCloudAccount.ts",
];

const scannedWriteFiles = new Set(scan.writes.map((w) => w.file));
const missed = PREVIOUSLY_LISTED_WRITE_FILES.filter((f) => !scannedWriteFiles.has(f));
assert.deepEqual(
  missed,
  [],
  `these files write broker tables but the scan saw no write in them:\n  ${missed.join(
    "\n  ",
  )}`,
);

console.log("TOS-SEC-2 repo-wide broker write guard: ok");
console.log(
  JSON.stringify(
    {
      filesScanned: scan.files,
      brokerTableWrites: scan.writes.length,
      brokerTableReads: scan.reads.length,
      sessionClientWrites: scan.violations.length,
      unclassified: scan.unclassified.length,
      writeFiles: [...new Set(scan.writes.map((w) => w.file))].sort(),
    },
    null,
    2,
  ),
);
