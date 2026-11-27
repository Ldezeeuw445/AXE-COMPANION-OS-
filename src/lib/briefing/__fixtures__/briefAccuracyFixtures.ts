/**
 * Fixtures for the brief-accuracy guard tests and the dry-run sample script.
 * Numbers are Luka's real Upcomers account state of 27 Nov 2026 15:50 CET
 * (read-only snapshot, no credentials) so the expected rooms can be checked
 * against the Trading OS funded suite: 294.45 used of 3,000 daily, 3,473.97
 * room of 6,000 max drawdown.
 */
import type { AccountRow, PositionRow } from "../accountsDigest";

export const SATURDAY = new Date("2026-11-21T06:05:00Z"); // Sat 07:05 CET
export const SUNDAY_PRE_OPEN = new Date("2026-11-22T21:30:00Z"); // Sun 22:30 CET, before FX open
export const WEEKDAY = new Date("2026-11-27T14:55:00Z"); // Fri 15:55 CET (day after Thanksgiving)
export const THANKSGIVING_EVENING = new Date("2026-11-26T19:00:00Z");
export const CHRISTMAS = new Date("2026-12-25T09:00:00Z");

export const LUKA_WATCHLIST = ["BRENT", "SPX500", "UKOUSD", "US30", "USOUSD", "WTI", "XAUUSD"];
export const LUKA_TRADED = ["XAUUSD"];

export const UPCOMERS_ROW: AccountRow = {
  id: "acct-upcomers",
  label: "100K 1STEP UPCOMERS",
  status: "active",
  server: "Upcomers-Server",
  metadata: {
    firmModel: "Thunderbolt (1 step)",
    tosProgramId: "upcomers-thunderbolt-challenge",
    tradingRules: { maxTotalLossPct: 6 },
    liveAccountState: {
      equity: 97473.97,
      balance: 97473.97,
      currency: "USD",
      updatedAt: "2026-11-27T14:50:05.167Z",
      dayStartAt: "2026-11-26T22:00:05.805Z",
      dayStartDate: "2026-11-27",
      dayStartEquity: 97768.42,
      dayStartBalance: 97768.42,
      peakBalance: 99828.25,
      initialBalance: 99828.25,
    },
  },
};

export const PAPER_ROW: AccountRow = {
  id: "acct-paper",
  label: null,
  status: "active",
  server: null,
  metadata: { demo: true, equity: 100000, balance: 100000, currency: "USD", description: "Virtual paper trading account. No broker execution." },
};

export const OPEN_GOLD: PositionRow = {
  account_id: "acct-upcomers",
  symbol: "XAUUSD",
  type: "POSITION_TYPE_BUY",
  volume: 0.5,
  profit: -120.4,
  stop_loss: 3618.5,
  take_profit: 3702,
};

/** The real Saturday brief of 21 Nov 2026 (body as stored). */
export const SATURDAY_BRIEF_21_NOV = `Good morning Luka, the weather at your location is partly cloudy, 6°C.

MARKET OUTLOOK
As the Asian session opens, XAUUSD is trading at 3,532.87, presenting potential opportunities. Watch for price action near key levels today, especially given the volatility seen recently in the markets.

NEWS
Today, there are no major scheduled economic releases. However, keep in mind the recent market turmoil, as US stocks faced significant losses, particularly with the Nasdaq dropping over 5%. This could create ripple effects in the forex space, potentially impacting XAUUSD.

ACTION ITEMS
1. Monitor XAUUSD for potential reversals or breakouts, particularly around the previous week's high at 3,853.27.
2. Consider using your Fair Value Gap and Market Structure overlays to identify entry points today.`;

/** 18 Nov 2026: AUDCAD and the AUD Wage Price Index in a gold/oil trader's brief. */
export const AUD_BRIEF_18_NOV = `MARKET OUTLOOK
The Asian session is currently underway, and XAUUSD is showing some volatility within the 3,781 to 3,858 range. Keep an eye on the AUDCAD as it hovers around 0.961, with potential for movement based on the upcoming economic data.

NEWS
At 01:30, the Wage Price Index for AUD is set to be released, which could impact AUDCAD.`;
