import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { liveAccountDayKey } from "../lib/mt5/liveAccountSnapshot";

/**
 * Once-a-day watcher notices (broker health, concentration, weekend, playbook
 * edge, drawdown) dedup on the broker trading day, not the UTC date. A UTC key
 * re-fired a still-true warning at 01:00 Amsterdam (UTC midnight) and split a
 * session that runs across UTC midnight into two "days".
 */
const src = readFileSync(new URL("./axeProactiveWatcher.ts", import.meta.url), "utf8");

describe("watcher dedup day", () => {
  it("no event key is built from the UTC date", () => {
    const keys = src.split("\n").filter((l) => l.includes("eventKey:"));
    assert.ok(keys.length >= 4, "expected the once-a-day event keys");
    for (const line of keys) {
      assert.ok(!line.includes("toISOString()"), `UTC-date event key: ${line.trim()}`);
    }
  });

  it("each once-a-day notice uses the shared broker-day stamp", () => {
    for (const prefix of ["broker_health:", "concentration:", "weekend:", "playbook_edge:"]) {
      const line = src.split("\n").find((l) => l.includes("eventKey:") && l.includes(prefix));
      assert.ok(line, `missing event key ${prefix}`);
      assert.ok(line.includes("${dayStamp}"), `${prefix} not keyed on dayStamp`);
    }
    assert.match(src, /const dayStamp = liveAccountDayKey\(accountRow\?\.metadata \?\? null\)/);
  });

  it("an evening and the following UTC-midnight hour are one broker day", () => {
    // Nov 2026: EET = UTC+2, broker day opens 22:00Z.
    const a = liveAccountDayKey(null, new Date("2026-11-17T22:30:00Z"));
    const b = liveAccountDayKey(null, new Date("2026-11-18T00:30:00Z"));
    const before = liveAccountDayKey(null, new Date("2026-11-17T21:30:00Z"));
    assert.equal(a, b);
    assert.notEqual(before, a);
  });
});
