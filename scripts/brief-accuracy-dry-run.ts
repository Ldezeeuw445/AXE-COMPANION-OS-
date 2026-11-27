/**
 * Dry run of the brief-accuracy pipeline on fixtures — no database, no LLM,
 * nothing sent. Prints, for a weekday, a Saturday and a weekend recap:
 * the resolved focus, MARKET STATUS, YOUR ACCOUNTS, and a model-style draft
 * after the server guard (violations listed, then cut).
 *
 *   npx tsx scripts/brief-accuracy-dry-run.ts
 *
 * The draft paragraphs are a fixed sample of what the model writes; every
 * other line is real output of the code under test.
 */
import { summarizeMarketStatus, describeMarketStatus } from "../src/lib/market/marketHours";
import { normalizeBriefFocusPrefs, resolveBriefFocus, describeFocusForPrompt } from "../src/lib/briefing/briefFocus";
import { validateBriefContent, stripContentViolations } from "../src/lib/briefing/briefContentGuard";
import { digestAccount, formatAccountLines } from "../src/lib/briefing/accountsDigest";
import { withServerSections } from "../src/lib/briefing/briefSections";
import {
  LUKA_TRADED,
  LUKA_WATCHLIST,
  OPEN_GOLD,
  PAPER_ROW,
  SATURDAY,
  UPCOMERS_ROW,
  WEEKDAY,
} from "../src/lib/briefing/__fixtures__/briefAccuracyFixtures";

const TZ = "Europe/Amsterdam";

/** The fixture snapshot, re-dated so it is fresh at `now` (weekday) or Friday's close (weekend). */
function atTime(row: typeof UPCOMERS_ROW, now: Date): typeof UPCOMERS_ROW {
  const live = { ...(row.metadata!.liveAccountState as Record<string, unknown>) };
  const weekend = summarizeMarketStatus(["EURUSD"], now).tradFiWeekend;
  if (weekend) {
    live.updatedAt = "2026-11-20T21:59:00.000Z";
    live.dayStartAt = "2026-11-19T22:00:05.000Z";
  } else {
    live.updatedAt = new Date(now.getTime() - 60_000).toISOString();
    live.dayStartAt = new Date(now.getTime() - 8.5 * 3600_000).toISOString();
  }
  return { ...row, metadata: { ...row.metadata, liveAccountState: live } };
}

function run(label: string, now: Date, draft: string, positions = [] as typeof OPEN_GOLD[]) {
  const fx = summarizeMarketStatus(["EURUSD"], now);
  const tradFiClosed = fx.tradFiWeekend;
  const focus = resolveBriefFocus({
    prefs: normalizeBriefFocusPrefs(null),
    watchlist: LUKA_WATCHLIST,
    traded: LUKA_TRADED,
    openPositions: positions.map((p) => p.symbol),
    tradFiClosed,
  });
  const marketStatus = summarizeMarketStatus(focus.markets.map((m) => m.symbol), now);
  const accounts = [
    digestAccount(atTime(UPCOMERS_ROW, now), positions, now, { marketsOpen: !tradFiClosed }),
    digestAccount(PAPER_ROW, [], now, { marketsOpen: !tradFiClosed }),
  ];
  const v = validateBriefContent(draft, { status: marketStatus, focus });
  const body = withServerSections(stripContentViolations(draft, v), { marketStatus, timezone: TZ, accounts });
  console.log(`\n=============== ${label} — ${now.toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })} ===============`);
  console.log(`\n[prompt focus]\n${describeFocusForPrompt(focus)}`);
  console.log(`\n[guard] ${v.length} violation(s)${v.map((x) => `\n  - ${x.kind} ${x.symbol}: "${x.sentence}"`).join("")}`);
  console.log(`\n[saved brief]\n${body}`);
}

run(
  "WEEKDAY MORNING BRIEF",
  new Date("2026-11-27T06:30:00Z"),
  `Good morning Luka, the weather at your location is clear, -1°C.

MARKET OUTLOOK
London is opening on a thin post-Thanksgiving Friday. XAUUSD trades at 3,651.76 inside yesterday's 3,557.51–3,666.53 range; BRENT and WTI follow the dollar. Keep an eye on AUDCAD as well.

NEWS
No high-impact USD release today; liquidity stays thin with US desks half-staffed.

ALIGNMENT SCORE
You're at 63% aligned — AXE knows your style well.

ACTION ITEMS
1. Watch XAUUSD at the previous-day high 3,666.53 for a rejection.
2. Size down: the Upcomers account has $2,705.55 daily room left.

WATCH THIS SESSION
XAUUSD reaction at 3,666.53 in the London morning.`,
  [OPEN_GOLD],
);

run(
  "WEEKEND MORNING BRIEF",
  SATURDAY,
  `Good morning Luka, the weather at your location is partly cloudy, 6°C.

MARKET OUTLOOK
BTCUSD is the only market open this weekend, trading at 56,347.69. As the Asian session opens, monitor XAUUSD for reversals today.

WEEK AHEAD
XAUUSD, BRENT and US30 are closed until Sunday night; Friday's last close in gold was 3,532.87. At the reopen, watch for a gap after the Nasdaq sell-off.

ALIGNMENT SCORE
You're at 62% aligned — AXE knows your style well.

ACTION ITEMS
1. Mark Friday's close in XAUUSD before the reopen.
2. Note the dated high-impact events of next week.`,
);

// Recap: the shared broadcast + this trader's accounts as the feed appends them.
const recapNow = new Date("2026-11-21T19:05:00Z");
const recapStatus = summarizeMarketStatus(["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD"], recapNow);
console.log(`\n=============== WEEKEND MARKET RECAP (shared broadcast + your accounts) — Sat 21 Nov 20:05 CET ===============`);
console.log(`\n[DATA block MARKET STATUS]\n${recapStatus.statuses.map((s) => `- ${describeMarketStatus(s, TZ)}`).join("\n")}`);
console.log(`\n[prompt variant] closedDay=true → crypto first, then "At the reopen:" line; no session recap for closed markets`);
const recapAccounts = [digestAccount(atTime(UPCOMERS_ROW, recapNow), [], recapNow, { marketsOpen: false }), digestAccount(PAPER_ROW, [], recapNow, { marketsOpen: false })];
console.log(`\n[appended on the card]\nYOUR ACCOUNTS (live, 20:05 CET)\n${formatAccountLines(recapAccounts, TZ).join("\n")}`);
