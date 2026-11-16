import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccountProfile } from "../risk/accountProfile";
import { evaluateAutoTrade, type AutoTradeGuardInput } from "./autoTradeGuard";
import { readNewsWindow } from "./newsWindow";

// Funded prop account: news trading is forbidden. A mid-week noon, no weekend edge.
const funded = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
const live = buildAccountProfile({ label: "MT5 LIVE", mt5Server: "ICMarkets-Live" });
const NOW = new Date("2026-11-11T12:00:00Z"); // Wednesday

const base = (over: Partial<AutoTradeGuardInput>): AutoTradeGuardInput => ({
  profile: funded,
  volumeLots: 0.1,
  openPositions: 0,
  autoTradesToday: 0,
  dayResultPct: 0,
  minutesToHighImpact: null,
  now: NOW,
  ...over,
});

test("fixture sanity: funded forbids news trading, personal live does not", () => {
  assert.equal(funded.newsTradingAllowed, false);
  assert.equal(live.newsTradingAllowed, true);
});

test("calendar unreadable on a no-news account: unattended auto-trade is BLOCKED as news_unknown", () => {
  const d = evaluateAutoTrade(base({ calendarKnown: false }));
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "news_unknown");
  assert.match(d.allowed === false ? d.detail : "", /could not read the economic calendar/);
});

test("calendar readable and quiet: still allowed (the fix does not block everything)", () => {
  assert.equal(evaluateAutoTrade(base({ calendarKnown: true })).allowed, true);
  // Omitted flag keeps the old behaviour for every existing caller.
  assert.equal(evaluateAutoTrade(base({})).allowed, true);
});

test("an account that may trade news is not blocked by an unreadable calendar", () => {
  assert.equal(evaluateAutoTrade(base({ profile: live, calendarKnown: false })).allowed, true);
});

test("attended (human-pressed) order is not blocked by an unreadable calendar", () => {
  assert.equal(evaluateAutoTrade(base({ calendarKnown: false, attended: true })).allowed, true);
});

test("a known high-impact event still reports news_restricted, not news_unknown", () => {
  const d = evaluateAutoTrade(base({ calendarKnown: true, minutesToHighImpact: 10 }));
  assert.equal(d.allowed === false && d.reason, "news_restricted");
});

test("readNewsWindow: no events at all means the calendar is unknown, never 'clear'", () => {
  assert.deepEqual(readNewsWindow([], NOW.getTime()), {
    calendarKnown: false,
    minutesToHighImpact: null,
  });
  assert.deepEqual(readNewsWindow(null, NOW.getTime()), {
    calendarKnown: false,
    minutesToHighImpact: null,
  });
});

test("readNewsWindow: events present but none high-impact near now is known + null", () => {
  const events = [
    { impact: "low", startsAt: "2026-11-11T12:10:00Z" },
    { impact: "high", startsAt: "2026-11-12T12:00:00Z" }, // a day away
  ];
  assert.deepEqual(readNewsWindow(events, NOW.getTime()), {
    calendarKnown: true,
    minutesToHighImpact: null,
  });
});

test("readNewsWindow: picks the nearest high-impact event in the window", () => {
  const events = [
    { impact: "high", startsAt: "2026-11-11T12:40:00Z" },
    { impact: "high", startsAt: "2026-11-11T12:20:00Z" },
    { impact: "high", startsAt: "2026-11-11T10:00:00Z" }, // 120 min ago: outside window
  ];
  const r = readNewsWindow(events, NOW.getTime());
  assert.equal(r.calendarKnown, true);
  assert.equal(r.minutesToHighImpact, 20);
});
