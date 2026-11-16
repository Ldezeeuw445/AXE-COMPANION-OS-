import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccountProfile } from "../risk/accountProfile";
import { evaluateAutoTrade } from "./autoTradeGuard";

// A funded account: weekend holding is not allowed.
const funded = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
const live = buildAccountProfile({ label: "MT5 LIVE", mt5Server: "ICMarkets-Live" });

const at = (iso: string) =>
  evaluateAutoTrade({
    profile: funded,
    volumeLots: 0.1,
    openPositions: 0,
    autoTradesToday: 0,
    dayResultPct: 0,
    totalLoss: { status: "ok", usedPct: 0, limitPct: 10 },
    minutesToHighImpact: null,
    now: new Date(iso),
  });

test("funded profile forbids weekend holding (fixture sanity)", () => {
  assert.equal(funded.weekendHoldingAllowed, false);
});

test("winter: Friday 21:30 UTC (16:30 New York) is still before the 22:00 UTC close and must block", () => {
  // 2026-11-13 is a Friday; New York is on EST (UTC-5), so FX closes 22:00 UTC.
  const d = at("2026-11-13T21:30:00Z");
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "weekend_restricted");
});

test("winter: window starts three hours before the real close (19:00 UTC), not at 18:00", () => {
  assert.equal(at("2026-11-13T18:30:00Z").allowed, true);
  assert.equal(at("2026-11-13T19:00:00Z").allowed, false);
});

test("summer: Friday 20:30 UTC blocks, 21:00 UTC (17:00 New York, market closed) does not", () => {
  // 2026-10-09 is a Friday on EDT (UTC-4): close is 21:00 UTC.
  assert.equal(at("2026-10-09T20:30:00Z").allowed, false);
  assert.equal(at("2026-10-09T21:00:00Z").allowed, true);
  assert.equal(at("2026-10-09T17:30:00Z").allowed, true);
});

test("weekdays and accounts that may hold over the weekend are untouched", () => {
  assert.equal(at("2026-11-12T21:30:00Z").allowed, true); // Thursday
  const d = evaluateAutoTrade({
    profile: live,
    volumeLots: 0.1,
    openPositions: 0,
    autoTradesToday: 0,
    dayResultPct: 0,
    totalLoss: { status: "ok", usedPct: 0, limitPct: 10 },
    minutesToHighImpact: null,
    now: new Date("2026-11-13T21:30:00Z"),
  });
  assert.equal(d.allowed, true);
});
