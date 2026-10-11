/**
 * Verification for src/lib/risk/brokerHealth.ts
 *
 * The case that went unnoticed for eight days: MetaApi refusing every sync
 * while the app showed stale numbers as if they were current. And the opposite
 * case, which matters just as much: a healthy account must produce silence, or
 * the trader learns to ignore the warning that counts.
 *
 * Run: node scripts/verify-broker-health.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brokerHealthWarning } from "../src/lib/risk/brokerHealth.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const NOW = new Date("2026-10-11T12:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

console.log("brokerHealth");

check("a healthy account says nothing", () => {
  assert.equal(
    brokerHealthWarning(
      {
        label: "MT5 LIVE",
        providerStatus: "connected",
        lastSyncAt: hoursAgo(0.1),
        connectionMethod: "cloud_mt5",
      },
      NOW,
    ),
    null,
  );
});

check("the real October failure is caught, with the age of the data", () => {
  // Exactly the state the database was in: sync_failed, last good sync 8 days back.
  const w = brokerHealthWarning(
    {
      label: "MT5 DEMO 500K",
      providerStatus: "sync_failed",
      lastSyncAt: hoursAgo(8 * 24),
      connectionMethod: "cloud_mt5",
    },
    NOW,
  );
  assert.ok(w, "this is the eight-day silence");
  assert.equal(w.kind, "failing");
  assert.match(w.title, /is not connecting/);
  assert.match(w.body, /8 days ago/);
  assert.match(w.body, /out of date/, "the trader must know the numbers are wrong, not just the connection");
});

check("silence with no error is still a problem", () => {
  // Nothing complains, nothing arrives. The hardest case to notice.
  const w = brokerHealthWarning(
    {
      label: "MT5 LIVE",
      providerStatus: "connected",
      lastSyncAt: hoursAgo(30),
      connectionMethod: "cloud_mt5",
    },
    NOW,
  );
  assert.ok(w);
  assert.equal(w.kind, "stale");
  assert.match(w.title, /has not synced in 30 hours/);
});

check("a short gap is not an incident", () => {
  assert.equal(
    brokerHealthWarning(
      {
        label: "MT5 LIVE",
        providerStatus: "connected",
        lastSyncAt: hoursAgo(2),
        connectionMethod: "cloud_mt5",
      },
      NOW,
    ),
    null,
    "sync runs every 10 min; two hours can be a quiet market, not a fault",
  );
});

check("an account still provisioning is left alone", () => {
  assert.equal(
    brokerHealthWarning(
      { label: "New account", providerStatus: "provisioning", lastSyncAt: null, connectionMethod: "cloud_mt5" },
      NOW,
    ),
    null,
  );
});

check("but provisioning that never finished does get reported", () => {
  const w = brokerHealthWarning(
    { label: "New account", providerStatus: "provisioning", lastSyncAt: hoursAgo(20), connectionMethod: "cloud_mt5" },
    NOW,
  );
  assert.ok(w, "twenty hours of 'provisioning' is stuck, not busy");
});

check("a linked account that never synced is reported", () => {
  const w = brokerHealthWarning(
    { label: "MT5 LIVE", providerStatus: "credentials_invalid", lastSyncAt: null, connectionMethod: "cloud_mt5" },
    NOW,
  );
  assert.ok(w);
  assert.equal(w.kind, "failing");
  assert.match(w.body, /never synced/);
});

check("the paper account is never nagged about", () => {
  assert.equal(
    brokerHealthWarning(
      { label: "AXE Demo Account", providerStatus: "sync_failed", lastSyncAt: hoursAgo(500), connectionMethod: "demo_paper" },
      NOW,
    ),
    null,
    "a paper account going stale costs nobody anything",
  );
});

console.log("watcher wiring");
const watcher = readFileSync("src/services/axeProactiveWatcher.ts", "utf8");

check("the watcher runs the check and reads the columns it needs", () => {
  assert.ok(/brokerHealthWarning\(/.test(watcher));
  assert.ok(/provider_status,last_sync_at/.test(watcher), "cannot judge sync health without those two columns");
});

check("the warning is keyed per day, not per run", () => {
  assert.ok(
    /broker_health:\$\{accountId \?\? "none"\}:\$\{health\.kind\}/.test(watcher),
    "a broken connection stays broken; repeating it every 15 minutes trains people to ignore it",
  );
});

console.log(`\n${passed} checks passed`);
