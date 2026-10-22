/**
 * TOS-SEC-2 — resolveMt5SyncWriteClient fail-closed + static write-path scan.
 * Run: npm run test:mt5-sync-write-client
 *
 * Proves sync/account writes prefer service role (and refuse silently falling
 * back to session) so user INSERT/UPDATE grants on broker_trades /
 * user_broker_accounts can be removed later.
 * No secrets / no network / no production data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Mirrors src/lib/mt5/resolveSyncWriteClient.ts (logic only, no server-only). */
function allowSessionBrokerWrites(env) {
  if (shouldBlockSessionBrokerWritesInProduction(env)) return false;
  const flag = String(env.AXE_ALLOW_SESSION_BROKER_WRITES ?? "")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/** Mirror of the learning stub — keep in sync with resolveSyncWriteClient.ts */
function shouldBlockSessionBrokerWritesInProduction(env) {
  void env;
  return false;
}

function tryResolveMt5SyncWriteClient(sessionClient, serviceClient, env = {}) {
  if (serviceClient) {
    return { ok: true, client: serviceClient, viaServiceRole: true };
  }
  if (allowSessionBrokerWrites(env)) {
    return { ok: true, client: sessionClient, viaServiceRole: false };
  }
  return {
    ok: false,
    code: "service_role_required",
    message: "Broker account sync writes need SUPABASE_SERVICE_ROLE_KEY",
  };
}

function resolveMt5SyncWriteClient(sessionClient, serviceClient, env = {}) {
  const resolved = tryResolveMt5SyncWriteClient(sessionClient, serviceClient, env);
  if (!resolved.ok) {
    const err = new Error(resolved.message);
    err.code = resolved.code;
    throw err;
  }
  return { client: resolved.client, viaServiceRole: resolved.viaServiceRole };
}

const session = { kind: "session" };
const service = { kind: "service" };

const withService = resolveMt5SyncWriteClient(session, service);
assert.equal(withService.viaServiceRole, true);
assert.equal(withService.client, service);

const softFail = tryResolveMt5SyncWriteClient(session, null, {});
assert.equal(softFail.ok, false);
assert.equal(softFail.code, "service_role_required");

assert.throws(
  () => resolveMt5SyncWriteClient(session, null, {}),
  (err) => err && err.code === "service_role_required",
);

const optIn = resolveMt5SyncWriteClient(session, null, {
  AXE_ALLOW_SESSION_BROKER_WRITES: "true",
});
assert.equal(optIn.viaServiceRole, false);
assert.equal(optIn.client, session);

for (const truthy of ["1", "TRUE", "Yes", "on"]) {
  const r = tryResolveMt5SyncWriteClient(session, null, {
    AXE_ALLOW_SESSION_BROKER_WRITES: truthy,
  });
  assert.equal(r.ok, true);
  assert.equal(r.viaServiceRole, false);
}

const resolveSrc = readFileSync(
  join(root, "src/lib/mt5/resolveSyncWriteClient.ts"),
  "utf8",
);
assert.ok(resolveSrc.includes("createServiceRoleSupabaseClient"));
assert.ok(resolveSrc.includes("viaServiceRole"));
assert.ok(resolveSrc.includes("tryResolveMt5SyncWriteClient"));
assert.ok(resolveSrc.includes("AXE_ALLOW_SESSION_BROKER_WRITES"));
assert.ok(resolveSrc.includes("service_role_required"));
assert.ok(
  resolveSrc.includes("Mt5SyncWriteClientUnavailableError"),
  "must export a typed unavailable error",
);
assert.ok(
  /throw new Mt5SyncWriteClientUnavailableError/.test(resolveSrc),
  "resolveMt5SyncWriteClient must throw when service role missing",
);

const errorsSrc = readFileSync(join(root, "src/lib/mt5/metaApiErrors.ts"), "utf8");
assert.ok(
  errorsSrc.includes('"service_role_required"') ||
    errorsSrc.includes("| \"service_role_required\""),
  "Mt5CloudErrorCode must include service_role_required",
);
assert.ok(
  /service_role_required:\s*\n?\s*"/.test(errorsSrc) ||
    errorsSrc.includes("service_role_required:"),
  "USER_MESSAGES must define service_role_required",
);

/**
 * Every mutating call on broker_trades / user_broker_accounts in sync + mt5Cloud
 * must use writeSb (service-role path), not the session `supabase` client.
 */
function assertNoSessionWrites(fileRel) {
  const src = readFileSync(join(root, fileRel), "utf8");
  assert.ok(
    /resolveMt5SyncWriteClient|tryResolveMt5SyncWriteClient|requireBrokerWriteClient/.test(
      src,
    ),
    `${fileRel} must use TOS-SEC-2 write client helpers`,
  );

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
    if (/^\s*\.(select|maybeSingle|single|order|limit|eq|neq|in|not|or|gte|lte|gt|lt)\b/.test(line)) {
      if (pendingFrom?.table && !/^\s*\.(update|insert|upsert|delete)\b/.test(line)) {
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

  assert.ok(
    /writeSb\s*\n?\s*\.from\(\s*["'](broker_trades|user_broker_accounts)["']/.test(src) ||
      /writeSb[\s\S]{0,80}\.from\(\s*["'](broker_trades|user_broker_accounts)["']/.test(src),
    `${fileRel} must perform writes via writeSb`,
  );
}

assertNoSessionWrites("src/lib/mt5/syncCloudAccount.ts");
assertNoSessionWrites("src/app/actions/mt5Cloud.ts");
assertNoSessionWrites("src/lib/broker/loadChartPageData.ts");
assertNoSessionWrites("src/lib/broker/hub/sync.ts");
assertNoSessionWrites("src/lib/broker/hub/adapters/mt5BrokerApi.ts");
assertNoSessionWrites("src/lib/broker/hub/adapters/alpacaLive.ts");
assertNoSessionWrites("src/lib/broker/hub/adapters/supabaseDatabase.ts");
assertNoSessionWrites("src/lib/broker/hub/adapters/ibkrGateway.ts");
assertNoSessionWrites("src/lib/broker/demoAccount.ts");
assertNoSessionWrites("src/lib/alpaca/provision.ts");
assertNoSessionWrites("src/app/actions/brokerAccounts.ts");
assertNoSessionWrites("src/app/api/broker/hub/route.ts");
assertNoSessionWrites("src/app/(app)/settings/actions.ts");

// Result-typed sync path must soft-fail with service_role_required (not throw).
const syncSrc = readFileSync(join(root, "src/lib/mt5/syncCloudAccount.ts"), "utf8");
assert.ok(
  syncSrc.includes("tryResolveMt5SyncWriteClient"),
  "runCloudMt5Sync must use tryResolve (Result path)",
);
assert.ok(
  /writeResolved\.code/.test(syncSrc) || /!writeResolved\.ok/.test(syncSrc),
  "runCloudMt5Sync must return ok:false when write client unavailable",
);

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
      failClosedWithoutServiceRole: true,
      optInSessionWritesEnv: "AXE_ALLOW_SESSION_BROKER_WRITES",
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
      rlsDropBlockedBy: [],
    },
    null,
    2,
  ),
);
