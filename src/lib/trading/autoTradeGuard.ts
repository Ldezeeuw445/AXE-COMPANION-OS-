import type { AccountProfile } from "@/lib/risk/accountProfile";

/**
 * The last thing that runs before AXE places an order nobody is watching.
 *
 * Alert auto-trade already had three consent layers when this was written: a
 * global preference, a per-alert flag, and a thirty-minute armed window you
 * have to re-tap. Those answer "did the trader agree?" — they say nothing about
 * "is this trade allowed right now?".
 *
 * The gap that mattered: `accountProfile` knows a funded account may not trade
 * through high-impact news, and the proactive watcher warns the trader about
 * exactly that. But auto-trade would still fire straight through the same
 * event. AXE warning you not to do something and then doing it for you is the
 * worst possible combination — it is the moment a trader stops trusting the
 * app, and on a funded account it can end the account.
 *
 * Every rule here blocks rather than adjusts. Silently shrinking someone's
 * position is its own kind of lie; refusing and saying why is honest.
 *
 * Dependency-free apart from a type, so it can be exercised with
 * `node --experimental-strip-types`.
 */

export type AutoTradeGuardInput = {
  profile: AccountProfile;
  /** Lots the order would be placed at. */
  volumeLots: number;
  /** Positions already open on this account. */
  openPositions: number;
  /** Auto-trades already placed today, this account. */
  autoTradesToday: number;
  /** Realised result today as a percentage of balance; negative is a loss. */
  dayResultPct: number | null;
  /** Minutes until the next high-impact event, or null when none is near. */
  minutesToHighImpact: number | null;
  now: Date;
  /**
   * True when a human pressed the button for this specific order.
   *
   * It changes exactly one thing: the daily cap is a brake on automation
   * running unattended, so it does not apply to a trader placing a draft by
   * hand. Every account rule above it still does — those are the ones that
   * cost you the account, and they do not care who clicked.
   */
  attended?: boolean;
};

export type AutoTradeDecision =
  | { allowed: true }
  | {
      allowed: false;
      /** Stable identifier so the same block does not spam the feed. */
      reason:
        | "news_restricted"
        | "weekend_restricted"
        | "lot_above_limit"
        | "daily_loss_reached"
        | "daily_trade_cap";
      /** One sentence the trader reads in the feed. Names the rule and the number. */
      detail: string;
    };

/**
 * How many automated trades per day is reasonable without the trader looking.
 * Not a broker rule — a brake. An automation that fires twenty times in a day
 * has stopped being a tool and become a strategy nobody signed off on.
 */
export const MAX_AUTO_TRADES_PER_DAY = 6;

/** Inside this window an upcoming event counts as "news is happening". */
const NEWS_WINDOW_MINUTES = 30;

export function evaluateAutoTrade(input: AutoTradeGuardInput): AutoTradeDecision {
  const { profile, volumeLots, autoTradesToday, dayResultPct, minutesToHighImpact, now } = input;

  // 1. The account's own rules come first. These are the ones that cost you the
  //    account rather than a trade.
  if (
    !profile.newsTradingAllowed &&
    minutesToHighImpact !== null &&
    minutesToHighImpact >= -NEWS_WINDOW_MINUTES &&
    minutesToHighImpact <= NEWS_WINDOW_MINUTES
  ) {
    const when =
      minutesToHighImpact >= 0
        ? `in ${Math.max(1, Math.round(minutesToHighImpact))} min`
        : `${Math.abs(Math.round(minutesToHighImpact))} min ago`;
    return {
      allowed: false,
      reason: "news_restricted",
      detail: `Not placed: high-impact news ${when} and this is ${profile.description}. AXE will not trade through an event its own rules forbid.`,
    };
  }

  if (!profile.weekendHoldingAllowed && isWeekendEdge(now)) {
    return {
      allowed: false,
      reason: "weekend_restricted",
      detail: `Not placed: the market closes shortly and this account may not hold positions over the weekend.`,
    };
  }

  // 2. Size. A cap the trader stated is a cap, not a suggestion.
  if (profile.maxLot !== null && volumeLots > profile.maxLot) {
    return {
      allowed: false,
      reason: "lot_above_limit",
      detail: `Not placed: ${volumeLots} lots is above your ${profile.maxLot}-lot limit for this account. Lower your default size or raise the limit — AXE will not quietly place something smaller than you asked for.`,
    };
  }

  // 3. The day's damage. Trading on past a loss cap is how a funded account ends.
  if (
    profile.maxDailyLossPct !== null &&
    dayResultPct !== null &&
    dayResultPct <= -profile.maxDailyLossPct
  ) {
    return {
      allowed: false,
      reason: "daily_loss_reached",
      detail: `Not placed: you are ${Math.abs(dayResultPct).toFixed(2)}% down today and this account's limit is ${profile.maxDailyLossPct}%. The day is over for automation.`,
    };
  }

  // 4. The brake. Only for orders nobody is watching — see `attended`.
  if (!input.attended && autoTradesToday >= MAX_AUTO_TRADES_PER_DAY) {
    return {
      allowed: false,
      reason: "daily_trade_cap",
      detail: `Not placed: AXE has already placed ${autoTradesToday} automated trades today, which is the daily cap. Anything further is yours to place by hand.`,
    };
  }

  return { allowed: true };
}

/** Friday, within three hours of the 21:00 UTC close. */
function isWeekendEdge(now: Date): boolean {
  if (now.getUTCDay() !== 5) return false;
  const hour = now.getUTCHours();
  return hour >= 18 && hour < 21;
}
