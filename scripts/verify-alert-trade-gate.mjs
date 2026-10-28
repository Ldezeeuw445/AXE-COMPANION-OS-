/**
 * Four switches, one answer — and never a looser one.
 *
 * Build-list item L19.8: `alert_auto_trade_enabled` and the autonomy level
 * were two switches for one decision, checked in two files, neither screen
 * mentioning the other. A trader could set autonomy to level 3, fill in three
 * limits, tick three acknowledgements, watch an alert fire — and nothing
 * happened, silently, because a switch in a different screen was off.
 *
 * The danger in merging gates is that the merge is more permissive than the
 * parts. Most of what follows is that one worry: every gate still stops a
 * trade on its own, and the combined answer is never readier than the
 * strictest of them.
 *
 * Run: node scripts/verify-alert-trade-gate.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  alertTradeSetupGaps,
  evaluateAlertTradeGate,
} from "../src/lib/trading/alertAutoTrade.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Autonomy that genuinely permits unattended placing. */
const LEVEL_3 = {
  level: 3,
  maxLot: 1,
  maxRiskPct: 1,
  maxTradesPerDay: 3,
  acks: { unattended: true, limits: true, loss: true },
  grantedAt: "2026-10-01T00:00:00.000Z",
};
const LEVEL_2 = { ...LEVEL_3, level: 2 };
/** Level 3 chosen but never finished — the state that must resolve downwards. */
const LEVEL_3_HALF = { ...LEVEL_3, maxLot: null };

const open = { autonomy: LEVEL_3, channelEnabled: true, alertEnabled: true, armed: true };

console.log("every gate still stops a trade on its own");

check("all four open is the only way through", () => {
  assert.deepEqual(evaluateAlertTradeGate(open), { ready: true });
});

check("each gate, closed by itself, blocks", () => {
  const cases = [
    [{ ...open, autonomy: LEVEL_2 }, "autonomy_level"],
    [{ ...open, channelEnabled: false }, "channel_off"],
    [{ ...open, alertEnabled: false }, "alert_off"],
    [{ ...open, armed: false }, "not_armed"],
  ];
  for (const [input, expected] of cases) {
    const gate = evaluateAlertTradeGate(input);
    assert.equal(gate.ready, false, `${expected} let a trade through on its own`);
    assert.equal(gate.blocker, expected);
  }
});

check("a half-configured level 3 is not a level 3", () => {
  // The dangerous state autonomy.ts exists to catch: chosen but incomplete.
  // If this ever reads ready, a trader who never finished the form is trading
  // unattended.
  const gate = evaluateAlertTradeGate({ ...open, autonomy: LEVEL_3_HALF });
  assert.equal(gate.ready, false);
  assert.equal(gate.blocker, "autonomy_level");
  assert.ok(/missing/i.test(gate.detail), `should say what is missing: "${gate.detail}"`);
});

check("the merged gate is never readier than the strictest part", () => {
  // Brute force over all sixteen combinations: ready must mean all four open.
  const bools = [true, false];
  let readyCount = 0;
  for (const autonomy of [LEVEL_3, LEVEL_2]) {
    for (const channelEnabled of bools) {
      for (const alertEnabled of bools) {
        for (const armed of bools) {
          const input = { autonomy, channelEnabled, alertEnabled, armed };
          const gate = evaluateAlertTradeGate(input);
          const allOpen = autonomy === LEVEL_3 && channelEnabled && alertEnabled && armed;
          assert.equal(
            gate.ready,
            allOpen,
            `ready=${gate.ready} for ${JSON.stringify({ level: autonomy.level, channelEnabled, alertEnabled, armed })}`,
          );
          if (gate.ready) readyCount += 1;
        }
      }
    }
  }
  assert.equal(readyCount, 1, "exactly one of sixteen combinations may trade");
});

console.log("\nit names the switch that is actually in the way");

check("the most fundamental gate reports first", () => {
  // Telling someone to tap Arm when their autonomy level forbids placing at
  // all sends them to the wrong screen to do something that changes nothing.
  const everythingClosed = {
    autonomy: LEVEL_2,
    channelEnabled: false,
    alertEnabled: false,
    armed: false,
  };
  assert.equal(evaluateAlertTradeGate(everythingClosed).blocker, "autonomy_level");

  const onlyChannelAndBelow = { ...open, channelEnabled: false, alertEnabled: false, armed: false };
  assert.equal(evaluateAlertTradeGate(onlyChannelAndBelow).blocker, "channel_off");

  const onlyAlertAndBelow = { ...open, alertEnabled: false, armed: false };
  assert.equal(evaluateAlertTradeGate(onlyAlertAndBelow).blocker, "alert_off");
});

check("every refusal says something, and points somewhere real", () => {
  for (const input of [
    { ...open, autonomy: LEVEL_2 },
    { ...open, channelEnabled: false },
    { ...open, alertEnabled: false },
    { ...open, armed: false },
  ]) {
    const gate = evaluateAlertTradeGate(input);
    assert.ok(gate.detail.length > 30, `too terse to act on: "${gate.detail}"`);
    assert.ok(
      gate.href === null || gate.href.startsWith("/"),
      `href must be an in-app path: ${gate.href}`,
    );
    assert.ok(
      !/undefined|null|\[object/.test(gate.detail),
      `leaks code into the UI: "${gate.detail}"`,
    );
  }
});

check("the channel refusal explains it is a second switch, not the same one", () => {
  // This is the whole point of L19.8: someone who did everything right in the
  // autonomy screen has to learn that a different screen also has a say.
  const gate = evaluateAlertTradeGate({ ...open, channelEnabled: false });
  assert.ok(
    /separate switch/i.test(gate.detail),
    `must say it is a different switch: "${gate.detail}"`,
  );
  assert.ok(/settings/i.test(gate.detail), "and where that switch lives");
});

console.log("\nwhat a settings screen should warn about");

check("setup gaps ignore arming, which is not a setting left undone", () => {
  // Listing "not armed" beside the switches would make a correctly configured
  // account look broken for the 23.5 hours a day it is not armed.
  assert.deepEqual(alertTradeSetupGaps({ autonomy: LEVEL_3, channelEnabled: true, alertEnabled: true }), []);
  assert.equal(
    alertTradeSetupGaps({ autonomy: LEVEL_2, channelEnabled: true, alertEnabled: true }).length,
    1,
  );
  assert.equal(
    alertTradeSetupGaps({ autonomy: LEVEL_3, channelEnabled: false, alertEnabled: true }).length,
    1,
  );
});

console.log("\nthe service asks once, in one place");

check("alertAutoTradeService no longer keeps its own three early returns", () => {
  const svc = read("src/services/alertAutoTradeService.ts");
  assert.ok(svc.includes("evaluateAlertTradeGate("), "the service must use the shared gate");
  assert.ok(
    !/if \(!prefs\.alertAutoTradeEnabled\) return/.test(svc),
    "the silent preference check must be gone — that was the switch nobody could find",
  );
  assert.ok(
    !/if \(!isAlertAutoTradeArmed\(prefs\.alertAutoTradeArmedAt\)\) \{/.test(svc),
    "the arm check now runs inside the gate",
  );
});

check("a blocked alert says why in the feed, except the one it chose itself", () => {
  const svc = read("src/services/alertAutoTradeService.ts");
  assert.ok(
    /gate\.blocker !== "alert_off"/.test(svc),
    "an alert the trader switched off should not nag on every fire",
  );
  assert.ok(/gate\.detail/.test(svc), "the feed entry carries the real reason");
});

check("the settings screen warns instead of leaving the trader waiting", () => {
  // The symptom L19.8 describes: switch on, nothing happens, no explanation.
  const panel = read("src/components/settings/TradeExecutionPrefsPanel.tsx");
  assert.ok(
    panel.includes("alertTradeSetupGaps("),
    "the panel must ask the same function the server asks, or the two drift",
  );
  assert.ok(
    /alertAutoTrade && setupGaps\.length > 0/.test(panel),
    "the warning belongs with the switch that is on but ineffective",
  );
  const page = read("src/app/(app)/settings/page.tsx");
  assert.ok(/autonomy=\{tradeExecutionPrefs\.autonomy\}/.test(page), "the panel needs the real settings");
});

console.log(`\n${passed} checks passed`);
