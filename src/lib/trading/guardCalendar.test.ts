import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAccountProfile } from "../risk/accountProfile";
import { evaluateAutoTrade, type AutoTradeGuardInput } from "./autoTradeGuard";
import { readNewsWindow } from "./newsWindow";
import {
  isDuplicateEvent,
  mergeGuardCalendar,
  normaliseEventName,
  withTimeout,
  type GuardCalendarEvent,
} from "./guardCalendar";

const NOW = new Date("2026-11-11T12:00:00Z"); // Wednesday noon UTC
const funded = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });

const ff = (title: string, currency: string, at: string, impact = "high"): GuardCalendarEvent => ({
  id: `ff:${currency}:${title}:${at}`, title, currency, impact, startsAt: at, provider: "forexFactory",
});
const fc = (title: string, currency: string, at: string, impact = "high", allDay = false): GuardCalendarEvent => ({
  id: `fc:${title}`, title, currency, impact, startsAt: at, allDay, provider: "financeCalendar",
});

const guard = (events: readonly GuardCalendarEvent[], over: Partial<AutoTradeGuardInput> = {}) => {
  const r = readNewsWindow(events, NOW.getTime());
  return evaluateAutoTrade({
    profile: funded,
    volumeLots: 0.1,
    openPositions: 0,
    autoTradesToday: 0,
    dayResultPct: 0,
    totalLoss: { status: "ok", usedPct: 0, limitPct: 10 },
    minutesToHighImpact: r.minutesToHighImpact,
    calendarKnown: r.calendarKnown,
    now: NOW,
    ...over,
  });
};

test("normaliseEventName strips country, period and unit noise", () => {
  assert.equal(normaliseEventName("US CPI Report November 2026"), "cpi");
  assert.equal(normaliseEventName("CPI y/y"), "cpi");
  assert.equal(normaliseEventName("Non-Farm Employment Change"), "nonfarm employment change");
  assert.equal(normaliseEventName("Japan Tokyo CPI 2026-11 (preliminary)"), "tokyo cpi");
});

test("dedupe needs same currency, ≤ 2 min apart and the same name", () => {
  const a = ff("CPI y/y", "USD", "2026-11-11T13:30:00Z");
  assert.equal(isDuplicateEvent(a, fc("US CPI", "USD", "2026-11-11T13:30:00Z")), true);
  assert.equal(isDuplicateEvent(a, fc("US CPI", "USD", "2026-11-11T13:31:30Z")), true);
  assert.equal(isDuplicateEvent(a, fc("US CPI", "USD", "2026-11-11T13:33:00Z")), false); // > 2 min
  assert.equal(isDuplicateEvent(a, fc("Canada CPI", "CAD", "2026-11-11T13:30:00Z")), false); // other currency
  assert.equal(isDuplicateEvent(a, fc("US Retail Sales", "USD", "2026-11-11T13:30:00Z")), false); // other release
});

test("merge: union, existing rows always kept, duplicates skipped, sorted", () => {
  const existing = [
    ff("CPI y/y", "USD", "2026-11-11T13:30:00Z"),
    ff("Unemployment Claims", "USD", "2026-11-11T13:30:00Z", "medium"),
    ff("BOE Gov Speaks", "GBP", "2026-11-11T15:00:00Z"),
  ];
  const shared = [
    fc("US CPI", "USD", "2026-11-11T13:30:00Z"), // duplicate of CPI y/y
    fc("Japan Tokyo CPI", "JPY", "2026-11-11T23:30:00Z"), // only in Finance Calendar
    fc("China Official PMI", "CNY", "2026-11-11T01:30:00Z"),
  ];
  const out = mergeGuardCalendar(existing, shared);
  assert.equal(out.length, 5);
  for (const e of existing) assert.ok(out.includes(e), `kept ${e.title}`);
  assert.ok(!out.some((e) => e.title === "US CPI"));
  assert.deepEqual(out.map((e) => e.startsAt), [...out.map((e) => e.startsAt)].sort());
});

test("fallback: empty / stale shared list returns the existing list itself (exact old behaviour)", () => {
  const existing = [ff("CPI y/y", "USD", "2026-11-11T12:20:00Z")];
  assert.equal(mergeGuardCalendar(existing, []), existing);
  const empty: GuardCalendarEvent[] = [];
  assert.equal(mergeGuardCalendar(empty, []), empty);
  assert.deepEqual(readNewsWindow(mergeGuardCalendar(empty, []), NOW.getTime()), readNewsWindow([], NOW.getTime()));
  // same guard decision as before for every existing case
  for (const list of [existing, empty]) {
    assert.deepEqual(guard(mergeGuardCalendar(list, [])), guard(list));
  }
});

test("Finance Calendar date-only rows never create a midnight window", () => {
  const existing = [ff("Retail Sales m/m", "USD", "2026-11-12T13:30:00Z")];
  const merged = mergeGuardCalendar(existing, [fc("Germany Employment", "EUR", "2026-11-11T00:00:00Z", "high", true)]);
  assert.equal(merged, existing);
});

test("block window around a Finance Calendar-only event: same ±30 min rule, unchanged", () => {
  const existing = [ff("Retail Sales m/m", "USD", "2026-11-12T13:30:00Z")]; // a day away: quiet
  assert.equal(guard(existing).allowed, true);
  for (const [at, blocked] of [
    ["2026-11-11T12:30:00Z", true], // +30 min: inside
    ["2026-11-11T12:31:00Z", false], // +31 min: outside
    ["2026-11-11T11:30:00Z", true], // -30 min: inside
    ["2026-11-11T11:29:00Z", false], // -31 min: outside
  ] as const) {
    const d = guard(mergeGuardCalendar(existing, [fc("Japan Tokyo CPI", "JPY", at)]));
    assert.equal(d.allowed, !blocked, `${at} blocked=${blocked}`);
    if (!blocked) continue;
    assert.equal(d.allowed === false && d.reason, "news_restricted");
  }
  // medium impact from Finance Calendar does not block (only high does, as before)
  assert.equal(guard(mergeGuardCalendar(existing, [fc("US Claims", "USD", "2026-11-11T12:10:00Z", "medium")])).allowed, true);
});

test("XAUUSD and every symbol: no currency filter, before or after (any high-impact event counts)", () => {
  const existing = [ff("Retail Sales m/m", "USD", "2026-11-12T13:30:00Z")];
  const d = guard(mergeGuardCalendar(existing, [fc("China Official PMI", "CNY", "2026-11-11T12:15:00Z")]));
  assert.equal(d.allowed, false); // as an FF CNY row would have done
  assert.equal(guard([...existing, ff("Manufacturing PMI", "CNY", "2026-11-11T12:15:00Z")]).allowed, false);
});

test("existing chain failed but Finance Calendar fresh: calendar is known from Finance Calendar", () => {
  const r = readNewsWindow(mergeGuardCalendar([], [fc("US CPI", "USD", "2026-11-11T14:00:00Z")]), NOW.getTime());
  assert.equal(r.calendarKnown, true);
  assert.equal(r.minutesToHighImpact, null); // 120 min away: outside the look-ahead
});

test("withTimeout: value, rejection and slowness all resolve, never throw", async () => {
  assert.deepEqual(await withTimeout(Promise.resolve([1]), 50, []), [1]);
  assert.deepEqual(await withTimeout(Promise.reject(new Error("x")), 50, []), []);
  assert.deepEqual(await withTimeout(new Promise((r) => setTimeout(() => r([9]), 200)), 20, []), []);
});

test("wiring: tradeGuardService merges, keeps loadEconomicCalendar, times out the shared read", () => {
  const src = readFileSync(new URL("../../services/tradeGuardService.ts", import.meta.url), "utf8");
  assert.match(src, /loadEconomicCalendar\(\{ symbol, daysAhead: 2, limit: 200 \}\)/);
  assert.match(src, /withTimeout\(loadSharedEconomicCalendar\(2\), 3_000, \[\]\)/);
  assert.match(src, /readNewsWindow\(mergeGuardCalendar\(chainEvents \?\? \[\], sharedEvents\), Date\.now\(\)\)/);
});
