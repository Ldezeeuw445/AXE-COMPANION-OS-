/**
 * How much AXE may do on its own, and why a half-configured level 3 must not
 * behave like a finished one.
 *
 * Before this there was one switch — `alert_auto_trade_enabled` — between "AXE
 * suggests" and "AXE sends live orders to MT5 while you are asleep". The guard
 * kept that from being reckless, but every number it enforced came from the
 * broker's account profile or from a constant in the source. Nowhere had the
 * trader said, in their own words, how much they were willing to lose to a
 * machine. Build-list items 6.1 and 6.2.
 *
 * The dangerous state is the half-configured one: level 3 chosen, a limit left
 * blank. It resolves down to 2, loudly, and these checks are what keep it that
 * way.
 *
 * Run: node scripts/verify-autonomy.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTONOMY_ACK_KEYS,
  AUTONOMY_ACK_TEXT,
  AUTONOMY_LEVELS,
  AUTONOMY_MAX_LOT_CEILING,
  AUTONOMY_MAX_RISK_PCT_CEILING,
  AUTONOMY_MAX_TRADES_CEILING,
  DEFAULT_AUTONOMY,
  allAcked,
  autonomyAllows,
  isAutonomyLevel,
  normalizeLimit,
  resolveAutonomy,
  tighter,
} from "../src/lib/trading/autonomy.ts";
import { tradeRiskPct } from "../src/lib/trading/autonomyRisk.ts";
import { evaluateAutoTrade, MAX_AUTO_TRADES_PER_DAY } from "../src/lib/trading/autoTradeGuard.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const ALL_ACKED = { unattended: true, limits: true, loss: true };
const FULL_LEVEL_3 = {
  level: 3,
  maxLot: 1,
  maxRiskPct: 1,
  maxTradesPerDay: 3,
  acks: ALL_ACKED,
  grantedAt: "2026-10-17T00:00:00Z",
};

/** A funded account with no rules of its own, so the trader's limits are the test. */
const OPEN_PROFILE = {
  description: "a demo account",
  newsTradingAllowed: true,
  weekendHoldingAllowed: true,
  maxLot: null,
  maxDailyLossPct: null,
};

const BASE = {
  profile: OPEN_PROFILE,
  volumeLots: 0.1,
  openPositions: 0,
  autoTradesToday: 0,
  dayResultPct: 0,
  minutesToHighImpact: null,
  now: new Date("2026-10-14T12:00:00Z"), // a Wednesday
};

console.log("autonomy");

// ── the default is the one that asks a human ─────────────────────────────
check("the default is prepare-and-ask, not place", () => {
  assert.equal(DEFAULT_AUTONOMY.level, 2);
  assert.equal(resolveAutonomy(DEFAULT_AUTONOMY).level, 2);
  assert.ok(!allAcked(DEFAULT_AUTONOMY.acks), "nothing is acknowledged by default");
  assert.equal(DEFAULT_AUTONOMY.grantedAt, null);
});

check("an unreadable stored level becomes 2, never 3", () => {
  // The safe direction for a value nobody can parse is the one that stops and
  // asks. A corrupt row must not be a licence.
  for (const bad of [0, 4, -1, 2.5, "3", null, undefined, NaN]) {
    assert.ok(!isAutonomyLevel(bad), `${String(bad)} is not a level`);
    assert.equal(resolveAutonomy({ ...DEFAULT_AUTONOMY, level: bad }).level, 2);
  }
});

// ── a half-configured level 3 is level 2 ─────────────────────────────────
check("level 3 without a number resolves down, and says which", () => {
  for (const [field, label] of [
    ["maxLot", "a maximum lot size"],
    ["maxRiskPct", "a maximum risk per trade"],
    ["maxTradesPerDay", "a maximum number of trades per day"],
  ]) {
    const r = resolveAutonomy({ ...FULL_LEVEL_3, [field]: null });
    assert.equal(r.level, 2, `${field} missing must not be level 3`);
    assert.equal(r.requested, 3);
    assert.ok(r.downgraded);
    assert.ok(r.missing.includes(label), `missing should name ${label}, got ${r.missing}`);
  }
});

check("level 3 without a tick resolves down, and quotes the tick", () => {
  for (const key of AUTONOMY_ACK_KEYS) {
    const r = resolveAutonomy({
      ...FULL_LEVEL_3,
      acks: { ...ALL_ACKED, [key]: false },
    });
    assert.equal(r.level, 2, `${key} unticked must not be level 3`);
    assert.ok(
      r.missing.some((m) => m.includes(AUTONOMY_ACK_TEXT[key])),
      `the missing list must quote the statement, not a key name`,
    );
  }
});

check("a complete level 3 is level 3", () => {
  const r = resolveAutonomy(FULL_LEVEL_3);
  assert.equal(r.level, 3);
  assert.ok(!r.downgraded);
  assert.deepEqual(r.missing, []);
});

// ── the gate ─────────────────────────────────────────────────────────────
check("each level permits exactly what it says", () => {
  const l1 = { ...DEFAULT_AUTONOMY, level: 1 };
  assert.ok(autonomyAllows("suggest", l1).allowed);
  assert.ok(!autonomyAllows("prepare", l1).allowed);
  assert.ok(!autonomyAllows("place", l1).allowed);

  const l2 = DEFAULT_AUTONOMY;
  assert.ok(autonomyAllows("prepare", l2).allowed);
  assert.ok(!autonomyAllows("place", l2).allowed);

  assert.ok(autonomyAllows("place", FULL_LEVEL_3).allowed);
});

check("a human pressing the button is not governed by the level", () => {
  // `attended` means the trader acted. The account's own rules still apply —
  // those are enforced in autoTradeGuard and do not care who clicked.
  const l1 = { ...DEFAULT_AUTONOMY, level: 1 };
  assert.ok(autonomyAllows("place", l1, true).allowed);
  assert.ok(autonomyAllows("place", DEFAULT_AUTONOMY, true).allowed);
});

check("the refusal tells you what to do about it", () => {
  const half = { ...FULL_LEVEL_3, maxRiskPct: null };
  const d = autonomyAllows("place", half);
  assert.ok(!d.allowed);
  assert.equal(d.reason, "autonomy_level");
  assert.ok(/still missing/.test(d.detail), "a downgrade must name what is missing");
  assert.ok(/a maximum risk per trade/.test(d.detail));

  const plain = autonomyAllows("place", DEFAULT_AUTONOMY);
  assert.ok(/Settings/.test(plain.detail), "a plain level-2 refusal points at the setting");
});

// ── limits ───────────────────────────────────────────────────────────────
check("a typo cannot become a licence", () => {
  assert.equal(normalizeLimit(999, AUTONOMY_MAX_LOT_CEILING), AUTONOMY_MAX_LOT_CEILING);
  assert.equal(normalizeLimit(100, AUTONOMY_MAX_RISK_PCT_CEILING), AUTONOMY_MAX_RISK_PCT_CEILING);
  assert.equal(normalizeLimit(500, AUTONOMY_MAX_TRADES_CEILING), AUTONOMY_MAX_TRADES_CEILING);
  for (const bad of [0, -1, "", null, undefined, "abc", NaN, Infinity]) {
    assert.equal(normalizeLimit(bad, 10), null, `${String(bad)} is not a limit`);
  }
});

check("where both sides set a ceiling, the tighter one wins", () => {
  assert.equal(tighter(2, 5), 2);
  assert.equal(tighter(5, 2), 2);
  assert.equal(tighter(null, 2), 2);
  assert.equal(tighter(2, null), 2);
  assert.equal(tighter(null, null), null);
});

// ── the guard honours it ─────────────────────────────────────────────────
check("the level gate sits on the only road to MT5", () => {
  // The level decision lives in decideAutoTradeAllowed rather than inside the
  // pure guard, which keeps no runtime imports. That is only safe while every
  // path to the broker goes through it, so: it does, and nothing else calls
  // the raw guard.
  const service = read("src/services/tradeGuardService.ts");
  assert.ok(
    /autonomyAllows\("place", autonomy, attended\)/.test(service),
    "the service must ask before it places",
  );
  const gateAt = service.indexOf("autonomyAllows(");
  const guardAt = service.indexOf("evaluateAutoTrade({");
  assert.ok(gateAt > 0 && guardAt > gateAt, "the permission question comes first");

  const callers = ["src/services/alertAutoTradeService.ts", "src/services/executionRequestExecutionService.ts", "src/services/mt5QuickOrderService.ts", "src/app/api/mt5/order/route.ts"];
  for (const file of callers) {
    const src = read(file);
    assert.ok(src.includes("decideAutoTradeAllowed("), `${file} must go through the service`);
    assert.ok(
      !src.includes("evaluateAutoTrade("),
      `${file} must not call the raw guard and skip the level check`,
    );
  }
});

check("a guard with no limits behaves exactly as before", () => {
  // Every existing caller keeps working: without the fields the guard runs on
  // the account's rules alone, which is what it did before 6.1 existed.
  assert.equal(evaluateAutoTrade(BASE).allowed, true);
});

check("the trader's lot cap bites even when the broker has none", () => {
  const d = evaluateAutoTrade({
    ...BASE,
    volumeLots: 2,
    riskPct: 0.1,
    userMaxLot: 1,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "lot_above_limit");
  assert.ok(/your own 1-lot limit/.test(d.detail), "say whose limit it was");
});

check("the broker's tighter cap is still the one quoted", () => {
  const d = evaluateAutoTrade({
    ...BASE,
    profile: { ...OPEN_PROFILE, maxLot: 0.5 },
    volumeLots: 0.8,
    riskPct: 0.1,
    userMaxLot: 2,
  });
  assert.equal(d.allowed, false);
  assert.ok(/0.5-lot limit/.test(d.detail), `expected the 0.5 cap, got: ${d.detail}`);
});

check("a risk cap with no measurable risk refuses rather than guesses", () => {
  const d = evaluateAutoTrade({ ...BASE, userMaxRiskPct: 1, riskPct: null });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "risk_unknown");
  assert.ok(/not a limit/.test(d.detail));
});

check("a trade over the risk cap is refused, never resized", () => {
  const d = evaluateAutoTrade({ ...BASE, userMaxRiskPct: 1, riskPct: 2.5 });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "risk_above_limit");
  assert.ok(/will not resize/.test(d.detail), "shrinking someone's trade silently is its own lie");
});

check("the trader's daily cap can be stricter than ours, never looser", () => {
  const strict = evaluateAutoTrade({
    ...BASE,
    autoTradesToday: 3,
    riskPct: 0.1,
    userMaxTradesPerDay: 3,
  });
  assert.equal(strict.allowed, false);
  assert.equal(strict.reason, "daily_trade_cap");

  // Asking for more than the house limit does not raise the house limit.
  const loose = evaluateAutoTrade({
    ...BASE,
    autoTradesToday: MAX_AUTO_TRADES_PER_DAY,
    riskPct: 0.1,
    userMaxTradesPerDay: AUTONOMY_MAX_TRADES_CEILING,
  });
  assert.equal(loose.allowed, false);
  assert.equal(loose.reason, "daily_trade_cap");
});

check("the account's rules still outrank the trader's permission", () => {
  // Level 3 is permission to act, not permission to break the account.
  const d = evaluateAutoTrade({
    ...BASE,
    profile: { ...OPEN_PROFILE, newsTradingAllowed: false, description: "a funded account" },
    minutesToHighImpact: 5,
    riskPct: 0.1,
    userMaxLot: 1,
    userMaxRiskPct: 1,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "news_restricted");
});

// ── risk maths ───────────────────────────────────────────────────────────
check("risk per trade is computed, and null when it cannot be", () => {
  // XAUUSD: 100 per lot per price unit. 5.0 of distance at 0.1 lots = $50.
  const pct = tradeRiskPct({
    entryPrice: 4200,
    stopLoss: 4195,
    volumeLots: 0.1,
    equity: 10_000,
    pointValuePerLot: 100, // XAUUSD, per accountRiskBand
  });
  assert.ok(pct !== null);
  assert.ok(Math.abs(pct - 0.5) < 1e-9, `expected 0.5%, got ${pct}`);

  for (const missing of [
    { stopLoss: null },
    { entryPrice: null },
    { equity: null },
    { equity: 0 },
    { volumeLots: 0 },
    { stopLoss: 4200 }, // stop on top of entry: no distance, no risk to measure
    { pointValuePerLot: 0 },
  ]) {
    const r = tradeRiskPct({
      entryPrice: 4200,
      stopLoss: 4195,
      volumeLots: 0.1,
      equity: 10_000,
      pointValuePerLot: 100,
      ...missing,
    });
    assert.equal(r, null, `${JSON.stringify(missing)} should not produce a number`);
  }
});

// ── it is wired in, both paths ───────────────────────────────────────────
check("both order paths hand the guard the prices it needs", () => {
  // A risk cap that only applies on one of the two routes to MT5 is the same
  // shape of bug as the guard that used to protect only the alert path.
  const alertPath = read("src/services/alertAutoTradeService.ts");
  const draftPath = read("src/services/executionRequestExecutionService.ts");
  assert.ok(/entryPrice: entry/.test(alertPath), "the alert path knows its entry");
  assert.ok(/stopLoss: stops\.stopLoss/.test(alertPath), "and its stop");
  assert.ok(/entryPrice,\s*\n\s*stopLoss,/.test(draftPath), "the draft path passes both");

  const service = read("src/services/tradeGuardService.ts");
  assert.ok(service.includes("tradeRiskPct("), "the service computes the risk");
  assert.ok(
    service.includes("pointValuePerLot: pointValuePerLot(symbol)"),
    "with the same point value the risk band in the UI uses",
  );
  assert.ok(service.includes("userMaxLot: autonomy.maxLot"), "and passes the trader's ceilings");
  assert.ok(
    service.includes("autonomy_ack_unattended"),
    "the acknowledgements are read from the row, not assumed",
  );
});

check("the consent timestamp is stamped by the server", () => {
  const route = read("src/app/api/preferences/trade-execution/route.ts");
  assert.ok(
    /grantedAt: allAcked\(acks\) \? new Date\(\)\.toISOString\(\) : null/.test(route),
    "a client-sent timestamp on a consent record is not evidence of anything",
  );
  assert.ok(
    /const wantsAutonomy =/.test(route),
    "a POST that does not mention autonomy must not reset it",
  );
});

check("the panel shows what applies, not what is stored", () => {
  const panel = read("src/components/settings/AutonomyPanel.tsx");
  assert.ok(panel.includes("resolveAutonomy(draft)"), "the panel must resolve, like the guard does");
  assert.ok(panel.includes("resolved.missing"), "and show what is missing");
  for (const key of AUTONOMY_ACK_KEYS) {
    assert.ok(panel.includes("AUTONOMY_ACK_TEXT"), `the ack text comes from the shared module`);
  }
  assert.ok(
    !/I understand AXE can send/.test(panel),
    "the statements must not be retyped in the UI — the guard quotes them too",
  );
});

check("the migration cannot store a level outside 1..3", () => {
  const sql = read("supabase/migrations/20261017160000_autonomy_level.sql");
  assert.ok(/autonomy_level between 1 and 3/.test(sql), "the database checks it too");
  assert.ok(/default 2/.test(sql), "and defaults to prepare-and-ask");
  assert.ok(
    /autonomy_ack_unattended boolean not null default false/.test(sql),
    "the acknowledgements are columns, so a dispute is a SQL question",
  );
});

check("every level in the list has a label a trader can act on", () => {
  assert.equal(AUTONOMY_LEVELS.length, 3);
  AUTONOMY_LEVELS.forEach((l, i) => {
    assert.equal(l.level, i + 1, "the array is indexed by level - 1 elsewhere");
    assert.ok(l.label.length > 3 && l.summary.length > 20, `level ${l.level} needs real copy`);
  });
  assert.equal(AUTONOMY_MAX_LOT_CEILING, 50);
  assert.equal(AUTONOMY_MAX_RISK_PCT_CEILING, 10);
});

console.log(`\n${passed} checks passed`);
