/**
 * Static wiring checks for the 2026-11-16 sync recovery: the pieces that unit
 * tests cannot see because they live inside I/O code.
 *
 * Run: node scripts/verify-sync-recovery.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}
const read = (p) => readFileSync(p, "utf8");
const sync = read("src/lib/mt5/syncCloudAccount.ts");
const bg = read("src/lib/mt5/backgroundSync.ts");
const route = read("src/app/api/cron/mt5-sync/route.ts");
const builder = read("src/services/axeContextBuilder.ts");
const service = read("src/services/axeService.ts");

check("live figures are persisted before the symbol list and the deal history", () => {
  const early = sync.indexOf("persistLiveFiguresAndPositions(supabase");
  const symbols = sync.indexOf('"sync_symbols"');
  const deals = sync.indexOf('"sync_history_deals"');
  assert.ok(early > 0 && symbols > 0 && deals > 0);
  assert.ok(early < symbols && early < deals, "persist must come before symbols/deals");
});

check("a failed sync merges into the stored metadata, not the stale copy", () => {
  const catchBlock = sync.slice(sync.indexOf("  } catch (e) {\n    // Merge into"), sync.indexOf("const dealsFetched"));
  assert.ok(/readMetadata\(/.test(catchBlock), "catch must re-read metadata");
  assert.ok(!/\.\.\.prevMeta,\s*lastSyncErrorAt/.test(catchBlock), "catch must not spread prevMeta");
});

check("the final write keeps the live state written meanwhile", () => {
  assert.ok(/\.\.\.keepLive/.test(sync));
});

check("an undeployed terminal is restarted only on the unattended path", () => {
  assert.ok(/autoDeploy:\s*true/.test(bg));
  assert.ok(/opts\.autoDeploy === true/.test(sync));
});

check("the cron picks accounts by age OR broker-day roll, and with minAge under the tick interval", () => {
  assert.ok(/syncDueReason\(/.test(bg));
  const m = route.match(/minAgeMs:\s*(\d+)\s*\*\s*60\s*\*\s*1000/);
  assert.ok(m && Number(m[1]) < 10, "minAgeMs must be below the 10-minute tick");
});

check("AXE-chat live_account no longer comes from mt5_account_snapshots alone", () => {
  assert.ok(/pickLiveAccountContext\(/.test(builder));
  assert.ok(/liveAccountState|user_broker_accounts/.test(builder.slice(builder.indexOf("async function buildLegacy"))));
  assert.ok(/liveAccountPromptBlock\(/.test(service));
  assert.ok(!/LIVE ACCOUNT\$\{acctName\}/.test(service), "prompt must not hardcode the LIVE heading");
});

console.log(`\n${passed} checks passed`);
