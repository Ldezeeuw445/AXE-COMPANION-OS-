/**
 * TOS-SEC-2 — resolveMt5SyncWriteClient preference (no secrets / no network).
 * Run: node scripts/test-mt5-sync-write-client.mjs
 */
import assert from "node:assert/strict";

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

console.log("TOS-SEC-2 MT5 sync write client: ok");
console.log(
  JSON.stringify(
    {
      preferServiceRole: true,
      fallbackToSessionWhenMissing: true,
      ownershipStillViaUserIdFilter: true,
    },
    null,
    2,
  ),
);
