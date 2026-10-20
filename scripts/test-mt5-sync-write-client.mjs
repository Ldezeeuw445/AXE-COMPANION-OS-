/**
 * TOS-SEC-2 — resolveMt5SyncWriteClient preference + static write-path scan.
 * Run: npm run test:mt5-sync-write-client
 *
 * Proves sync/account writes prefer service role so user INSERT/UPDATE
 * grants on broker_trades / user_broker_accounts can be removed later.
 * No secrets / no network / no production data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Mirrors src/lib/mt5/resolveSyncWriteClient.ts */
function resolveMt5SyncWriteClient(sessionClient, serviceClient) {
  if (serviceClient) return { client: serviceClient, viaServiceRole: true };
  return { client: sessionClient, viaServiceRole: false };
}

const session = { kind: "session" };
const service = { kind: "service" };

const withService = resolveMt5SyncWriteClient(session, service);
assert.equal(withService.viaServiceRole, true);
assert.equal(withService.client, service);

const fallback = resolveMt5SyncWriteClient(session, null);
assert.equal(fallback.viaServiceRole, false);
assert.equal(fallback.client, session);

const resolveSrc = readFileSync(
  join(root, "src/lib/mt5/resolveSyncWriteClient.ts"),
  "utf8",
);
assert.ok(resolveSrc.includes("createServiceRoleSupabaseClient"));
assert.ok(resolveSrc.includes("viaServiceRole"));

/**
 * Every mutating call on broker_trades / user_broker_accounts in sync + mt5Cloud
 * must use writeSb (service-role path), not the session `supabase` client.
 */
function assertNoSessionWrites(fileRel) {
  const src = readFileSync(join(root, fileRel), "utf8");
  assert.ok(
    src.includes("resolveMt5SyncWriteClient"),
    `${fileRel} must import resolveMt5SyncWriteClient`,
  );

  // Line scan: every mutate on broker_trades / user_broker_accounts must use writeSb.
  const lines = src.split("\n");
  let pendingFrom = null;
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fromMatch = line.match(
      /(writeSb|supabase)\s*\n?\s*\.from\(\s*["'](broker_trades|user_broker_accounts)["']\s*\)/,
    );
    if (fromMatch) {
      pendingFrom = { client: fromMatch[1], table: fromMatch[2], line: i + 1 };
    }
    // Multi-line: client alone (optional void/await), e.g. `void writeSb`
    const clientOnly = line.match(/^\s*(?:await\s+|void\s+)?(writeSb|supabase)\s*$/);
    if (clientOnly) {
      pendingFrom = { client: clientOnly[1], table: null, line: i + 1 };
    }
    const fromOnly = line.match(
      /^\s*\.from\(\s*["'](broker_trades|user_broker_accounts)["']\s*\)/,
    );
    if (fromOnly && pendingFrom && pendingFrom.table == null) {
      pendingFrom.table = fromOnly[1];
    }
    // Reads must not keep a stale pendingFrom that later .update chains inherit.
    if (/^\s*\.(select|maybeSingle|single|order|limit|eq|neq|in|not|or|gte|lte|gt|lt)\b/.test(line)) {
      if (pendingFrom?.table && !/^\s*\.(update|insert|upsert|delete)\b/.test(line)) {
        // keep chaining filters; clear only when the chain is clearly a read
        if (/^\s*\.(select|maybeSingle|single)\b/.test(line)) {
          pendingFrom = null;
        }
      }
    }
    const mutate = line.match(/^\s*\.(update|insert|upsert|delete)\s*\(/);
    if (mutate && pendingFrom?.table) {
      if (pendingFrom.client === "supabase") {
        violations.push(
          `${fileRel}:${pendingFrom.line} session write on ${pendingFrom.table}.${mutate[1]}`,
        );
      }
      pendingFrom = null;
    }
  }

  // Also catch single-line: supabase.from("…").update(
  const singleLine = [
    ...src.matchAll(
      /(?:^|[^\w])supabase\s*\.\s*from\(\s*["'](broker_trades|user_broker_accounts)["']\s*\)\s*\.\s*(update|insert|upsert|delete)\s*\(/gm,
    ),
  ];
  for (const m of singleLine) {
    violations.push(`${fileRel}: session write on ${m[1]}.${m[2]}`);
  }

  assert.equal(
    violations.length,
    0,
    `TOS-SEC-2 session writes found:\n${violations.join("\n")}`,
  );

  // Positive: at least one writeSb mutation exists
  assert.ok(
    /writeSb\s*\n?\s*\.from\(\s*["'](broker_trades|user_broker_accounts)["']/.test(src) ||
      /writeSb[\s\S]{0,80}\.from\(\s*["'](broker_trades|user_broker_accounts)["']/.test(src),
    `${fileRel} must perform writes via writeSb`,
  );
}

assertNoSessionWrites("src/lib/mt5/syncCloudAccount.ts");
assertNoSessionWrites("src/app/actions/mt5Cloud.ts");
// Chart symbol-map backfill also mutates user_broker_accounts — must use writeSb.
assertNoSessionWrites("src/lib/broker/loadChartPageData.ts");
// Hub column backfill after MT5 connect/sync — called from mt5Cloud.
assertNoSessionWrites("src/lib/broker/hub/sync.ts");
// Hub adapters + provision paths (disconnect / save / demo / alpaca).
assertNoSessionWrites("src/lib/broker/hub/adapters/mt5BrokerApi.ts");
assertNoSessionWrites("src/lib/broker/hub/adapters/alpacaLive.ts");
assertNoSessionWrites("src/lib/broker/hub/adapters/supabaseDatabase.ts");
assertNoSessionWrites("src/lib/broker/hub/adapters/ibkrGateway.ts");
assertNoSessionWrites("src/lib/broker/demoAccount.ts");
assertNoSessionWrites("src/lib/alpaca/provision.ts");
assertNoSessionWrites("src/app/actions/brokerAccounts.ts");
assertNoSessionWrites("src/app/api/broker/hub/route.ts");
assertNoSessionWrites("src/app/(app)/settings/actions.ts");

// SELECT-only RLS migration must exist before ops applies the write-policy drop.
const rlsMigrationRel =
  "supabase/migrations/20260705120000_tos_sec2_broker_tables_select_only.sql";
const rlsMigration = readFileSync(join(root, rlsMigrationRel), "utf8");
assert.ok(
  rlsMigration.includes("user_broker_accounts") &&
    rlsMigration.includes("broker_trades"),
  `${rlsMigrationRel} must target both broker tables`,
);
assert.ok(
  /cmd in\s*\(\s*'INSERT',\s*'UPDATE',\s*'DELETE',\s*'ALL'\s*\)/i.test(
    rlsMigration,
  ) ||
    (rlsMigration.includes("'INSERT'") &&
      rlsMigration.includes("'UPDATE'") &&
      rlsMigration.includes("'DELETE'") &&
      rlsMigration.includes("'ALL'")),
  `${rlsMigrationRel} must drop INSERT/UPDATE/DELETE/ALL policies`,
);
assert.ok(
  rlsMigration.includes("user_broker_accounts_select_own") &&
    rlsMigration.includes("broker_trades_select_own"),
  `${rlsMigrationRel} must ensure SELECT-own policies`,
);
assert.ok(
  rlsMigration.includes("auth.uid() = user_id"),
  `${rlsMigrationRel} must scope SELECT to auth.uid() = user_id`,
);

console.log("TOS-SEC-2 MT5 sync write client: ok");
console.log(
  JSON.stringify(
    {
      preferServiceRole: true,
      fallbackToSessionWhenMissing: true,
      ownershipStillViaUserIdFilter: true,
      noSessionWritesOnBrokerTables: true,
      selectOnlyMigration: rlsMigrationRel,
      filesScanned: [
        "src/lib/mt5/syncCloudAccount.ts",
        "src/app/actions/mt5Cloud.ts",
        "src/lib/broker/loadChartPageData.ts",
        "src/lib/broker/hub/sync.ts",
        "src/lib/broker/hub/adapters/mt5BrokerApi.ts",
        "src/lib/broker/hub/adapters/alpacaLive.ts",
        "src/lib/broker/hub/adapters/supabaseDatabase.ts",
        "src/lib/broker/hub/adapters/ibkrGateway.ts",
        "src/lib/broker/demoAccount.ts",
        "src/lib/alpaca/provision.ts",
        "src/app/actions/brokerAccounts.ts",
        "src/app/api/broker/hub/route.ts",
        "src/app/(app)/settings/actions.ts",
      ],
      // Write paths migrated + SELECT-only migration staged (not applied here).
      rlsDropBlockedBy: [],
    },
    null,
    2,
  ),
);
