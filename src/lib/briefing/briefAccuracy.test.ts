import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marketStatus, summarizeMarketStatus } from "@/lib/market/marketHours";
import {
  isEventInFocus,
  isHeadlineInFocus,
  normalizeBriefFocusPrefs,
  resolveBriefFocus,
} from "./briefFocus";
import { findClosedMarketViolations, findOffFocusViolations, stripContentViolations, validateBriefContent } from "./briefContentGuard";
import { digestAccount, formatAccountLines, sizeFromLabel } from "./accountsDigest";
import { briefIsClosedMarketDay, briefPriceSymbols, withServerSections } from "./briefSections";
import { SHARED_PROP_PROGRAMS } from "@/lib/risk/sharedPropPrograms";
import {
  AUD_BRIEF_18_NOV,
  CHRISTMAS,
  LUKA_TRADED,
  LUKA_WATCHLIST,
  OPEN_GOLD,
  PAPER_ROW,
  SATURDAY,
  SATURDAY_BRIEF_21_NOV,
  SUNDAY_PRE_OPEN,
  THANKSGIVING_EVENING,
  UPCOMERS_ROW,
  WEEKDAY,
} from "./__fixtures__/briefAccuracyFixtures";

const auto = normalizeBriefFocusPrefs(null);

describe("market hours", () => {
  it("Saturday: gold, FX, indices, oil closed; bitcoin open", () => {
    for (const s of ["XAUUSD", "EURUSD", "US30", "WTI", "AAPL"]) assert.equal(marketStatus(s, SATURDAY).open, false, s);
    assert.equal(marketStatus("BTCUSD", SATURDAY).open, true);
    assert.equal(marketStatus("BTCUSD.nx", SATURDAY).assetClass, "crypto");
    assert.equal(summarizeMarketStatus(["XAUUSD"], SATURDAY).tradFiWeekend, true);
  });
  it("Sunday before 17:00 New York is still the weekend; after it FX reopens", () => {
    assert.equal(marketStatus("EURUSD", SUNDAY_PRE_OPEN).open, false);
    assert.equal(marketStatus("EURUSD", new Date("2026-11-22T22:05:00Z")).open, true);
    assert.equal(marketStatus("XAUUSD", new Date("2026-11-22T22:30:00Z")).open, false, "metals open 18:00 NY");
    assert.equal(marketStatus("XAUUSD", new Date("2026-11-22T23:05:00Z")).open, true);
  });
  it("DST: Friday 21:30 UTC in July is after the 17:00 NY close", () => {
    assert.equal(marketStatus("XAUUSD", new Date("2026-07-10T21:30:00Z")).open, false);
    assert.equal(marketStatus("XAUUSD", new Date("2026-07-10T20:30:00Z")).open, true);
  });
  it("holidays: Thanksgiving early close, Christmas closed, reopen time given", () => {
    const g = marketStatus("XAUUSD", THANKSGIVING_EVENING);
    assert.equal(g.open, false);
    assert.equal(g.reason, "early_close");
    assert.equal(g.holiday, "US Thanksgiving");
    const x = marketStatus("XAUUSD", CHRISTMAS);
    assert.equal(x.reason, "holiday");
    assert.ok(x.reopensAt && Date.parse(x.reopensAt) > CHRISTMAS.getTime());
    assert.equal(marketStatus("BTCUSD", CHRISTMAS).open, true);
  });
});

describe("brief focus", () => {
  it("auto uses the watchlist and traded markets — no BTCUSD on a weekday", () => {
    const f = resolveBriefFocus({ prefs: auto, watchlist: LUKA_WATCHLIST, traded: LUKA_TRADED, openPositions: [] });
    const syms = f.markets.map((m) => m.symbol);
    assert.equal(syms[0], "XAUUSD");
    assert.ok(syms.includes("BRENT") && syms.includes("US30"));
    assert.ok(!syms.includes("BTCUSD"));
    assert.ok(!syms.includes("AUDUSD") && !syms.includes("AUDCAD"));
    assert.deepEqual(briefPriceSymbols(syms).slice(0, 1), ["XAUUSD"]);
    assert.ok(!briefPriceSymbols(syms).includes("BTCUSD"), "no hard-coded BTCUSD any more");
  });
  it("weekend adds BTCUSD as the one open market, labelled", () => {
    const f = resolveBriefFocus({ prefs: auto, watchlist: LUKA_WATCHLIST, traded: LUKA_TRADED, openPositions: [], tradFiClosed: true });
    const btc = f.markets.find((m) => m.symbol === "BTCUSD");
    assert.deepEqual(btc?.reasons, ["weekend_crypto"]);
    const off = resolveBriefFocus({ prefs: { ...auto, weekendCrypto: false }, watchlist: LUKA_WATCHLIST, traded: LUKA_TRADED, openPositions: [], tradFiClosed: true });
    assert.ok(!off.markets.some((m) => m.symbol === "BTCUSD"));
  });
  it("custom list is exact; exclude always wins; open positions always added", () => {
    const prefs = normalizeBriefFocusPrefs({ mode: "custom", pairs: [{ symbol: "xauusd" }, { symbol: "BTCUSD", priority: "secondary" }], exclude: ["AUDUSD", "BTCUSD"] });
    const f = resolveBriefFocus({ prefs, watchlist: LUKA_WATCHLIST, traded: ["AUDCAD"], openPositions: ["US30"] });
    // Risk being carried comes first, then the chosen list; BTCUSD is excluded.
    assert.deepEqual(f.markets.map((m) => m.symbol), ["US30", "XAUUSD"]);
    assert.deepEqual(f.markets[0].reasons, ["open_position"]);
  });
  it("drivers are labelled: DXY / US10Y for gold", () => {
    const f = resolveBriefFocus({ prefs: auto, watchlist: [], traded: ["XAUUSD"], openPositions: [] });
    assert.deepEqual(f.drivers.map((d) => d.symbol).sort(), ["DXY", "US10Y"]);
    assert.deepEqual(f.drivers[0].for, ["XAUUSD"]);
  });
  it("AUD calendar events and RBA headlines are not news for a gold/oil trader", () => {
    const f = resolveBriefFocus({ prefs: auto, watchlist: LUKA_WATCHLIST, traded: LUKA_TRADED, openPositions: [] });
    assert.equal(isEventInFocus("AUD", f), false);
    assert.equal(isEventInFocus("USD", f), true);
    assert.equal(isHeadlineInFocus("RBA holds rates, Aussie dollar slips", null, f), false);
    assert.equal(isHeadlineInFocus("AUD/USD jumps after jobs data", null, f), false);
    assert.equal(isHeadlineInFocus("Gold extends gains as XAUUSD tests 3,650", null, f), true);
    assert.equal(isHeadlineInFocus("US CPI comes in hot", null, f), true);
  });
});

describe("content guard", () => {
  const weekendFocus = resolveBriefFocus({ prefs: auto, watchlist: LUKA_WATCHLIST, traded: LUKA_TRADED, openPositions: [], tradFiClosed: true });
  const weekendStatus = summarizeMarketStatus(weekendFocus.markets.map((m) => m.symbol), SATURDAY);

  it("weekend fixture: the real 21 Nov brief fails ('watch gold today')", () => {
    const v = findClosedMarketViolations(SATURDAY_BRIEF_21_NOV, weekendStatus);
    assert.ok(v.length >= 2, JSON.stringify(v));
    assert.ok(v.every((x) => x.symbol === "XAUUSD"));
    const stripped = stripContentViolations(SATURDAY_BRIEF_21_NOV, v);
    assert.doesNotMatch(stripped, /Monitor XAUUSD/);
  });
  it("weekend: honest framing passes, crypto 'today' passes", () => {
    const ok = [
      "XAUUSD is closed until Monday 00:00 CET; last close 3,537.33.",
      "At the reopen, watch for a gap in gold after Friday's sell-off.",
      "BTCUSD is trading at 61,717 and is the only market open today.",
    ].join(" ");
    assert.deepEqual(findClosedMarketViolations(ok, weekendStatus), []);
  });
  it("weekday: 'watch gold today' is fine while gold is open", () => {
    const st = summarizeMarketStatus(["XAUUSD"], WEEKDAY);
    assert.deepEqual(findClosedMarketViolations("Watch XAUUSD today around the prior-day high.", st), []);
  });
  it("pairs outside the selection fail (AUDCAD brief of 18 Nov)", () => {
    const f = resolveBriefFocus({ prefs: auto, watchlist: LUKA_WATCHLIST, traded: LUKA_TRADED, openPositions: [] });
    const v = findOffFocusViolations(AUD_BRIEF_18_NOV, f);
    assert.ok(v.some((x) => x.symbol === "AUDCAD"));
    assert.ok(!v.some((x) => x.symbol === "XAUUSD"));
    assert.equal(validateBriefContent("Keep an eye on EUR/USD today.", { status: summarizeMarketStatus(["XAUUSD"], WEEKDAY), focus: f })[0]?.symbol, "EURUSD");
  });
});

describe("accounts digest = Trading OS funded suite", () => {
  it("uses the shared catalog row for the TOS program", () => {
    const p = SHARED_PROP_PROGRAMS["upcomers-thunderbolt-challenge"];
    assert.equal(p.dailyPct, 3);
    assert.equal(p.maxPct, 6);
    assert.equal(p.maxKind, "trailing");
    assert.equal(p.dailyAnchor, "higher_of_balance_equity");
  });
  it("Upcomers 100K: 2,705.55 of 3,000 daily room, 3,473.97 of 6,000 max DD room", () => {
    const a = digestAccount(UPCOMERS_ROW, [], WEEKDAY, { marketsOpen: true });
    assert.equal(a.rulesSource, "trading_os_program");
    assert.equal(a.accountSize, 100000);
    assert.equal(a.daily?.limit, 3000);
    assert.equal(a.daily?.used.toFixed(2), "294.45");
    assert.equal(a.daily?.room.toFixed(2), "2705.55");
    assert.equal(a.maxDd?.limit, 6000);
    assert.equal(a.maxDd?.room.toFixed(2), "3473.97");
    assert.equal(a.stale, false);
  });
  it("covers every account, with positions; no invented limits on a paper account", () => {
    const accts = [digestAccount(UPCOMERS_ROW, [OPEN_GOLD], WEEKDAY, { marketsOpen: true }), digestAccount(PAPER_ROW, [], WEEKDAY, { marketsOpen: true })];
    const lines = formatAccountLines(accts, "Europe/Amsterdam");
    assert.match(lines[0], /100K 1STEP UPCOMERS .*daily room \$2,705\.55 of \$3,000\.00 .*max DD room \$3,473\.97 of \$6,000\.00 .*1 open/);
    assert.match(lines[1], /XAUUSD BUY 0.5 lot/);
    assert.match(lines.join("\n"), /AXE Paper \(paper\): equity \$100,000\.00/);
    assert.doesNotMatch(lines.join("\n"), /AXE Paper.*daily room/);
  });
  it("stated Companion rules only tighten the firm's; stale data is flagged", () => {
    const tighter = { ...UPCOMERS_ROW, metadata: { ...UPCOMERS_ROW.metadata, tradingRules: { maxDailyLossPct: 2 } } };
    assert.equal(digestAccount(tighter, [], WEEKDAY, { marketsOpen: true }).daily?.limit, 2000);
    const looser = { ...UPCOMERS_ROW, metadata: { ...UPCOMERS_ROW.metadata, tradingRules: { maxDailyLossPct: 5 } } };
    assert.equal(digestAccount(looser, [], WEEKDAY, { marketsOpen: true }).daily?.limit, 3000);
    const later = new Date(WEEKDAY.getTime() + 60 * 60 * 1000);
    assert.equal(digestAccount(UPCOMERS_ROW, [], later, { marketsOpen: true }).stale, true);
  });
  it("label sizes", () => {
    assert.equal(sizeFromLabel("100K 1STEP UPCOMERS"), 100000);
    assert.equal(sizeFromLabel("FUNDEDNEXT 50K 2STEP CHALLENGE"), 50000);
    assert.equal(sizeFromLabel("AXE Demo"), null);
  });
});

describe("server-written sections", () => {
  it("weekend brief gets MARKET STATUS before the outlook and YOUR ACCOUNTS before the alignment score", () => {
    const f = resolveBriefFocus({ prefs: auto, watchlist: ["XAUUSD"], traded: [], openPositions: [], tradFiClosed: true });
    const ctx = {
      marketStatus: summarizeMarketStatus(f.markets.map((m) => m.symbol), SATURDAY),
      timezone: "Europe/Amsterdam",
      accounts: [digestAccount(UPCOMERS_ROW, [], SATURDAY, { marketsOpen: false })],
    };
    assert.equal(briefIsClosedMarketDay(ctx), true);
    const body = withServerSections("Good morning Luka.\n\nMARKET OUTLOOK\nBTCUSD is the only market open.\n\nALIGNMENT SCORE\nYou're at 63% aligned.", ctx);
    const i = (h: string) => body.indexOf(h);
    assert.ok(i("MARKET STATUS") > 0 && i("MARKET STATUS") < i("MARKET OUTLOOK"));
    assert.ok(i("YOUR ACCOUNTS") > i("MARKET OUTLOOK") && i("YOUR ACCOUNTS") < i("ALIGNMENT SCORE"));
    assert.match(body, /XAUUSD: CLOSED \(closed for the weekend, reopens Mon/);
    assert.match(body, /BTCUSD: OPEN \(24\/7\)/);
  });
});
