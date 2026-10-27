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
  /** Day equity result as a percentage of start-of-day equity; negative is a loss. */
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
  /* ── the trader's own ceilings ────────────────────────────────────────
     Plain numbers, not the settings object, so this file keeps no runtime
     imports and `node --experimental-strip-types` can still exercise it.
     Whether the trader granted unattended trading at all is decided one layer
     up, in `decideAutoTradeAllowed` — see autonomy.ts.

     Optional, so every existing caller keeps working: without them the guard
     runs on the account's rules alone, exactly as it did. With them, the
     tighter of the two sides wins. A prop firm's 2-lot cap does not become 5
     because the trader typed 5, and 0.5 does not become 2 because the broker
     allows it. ─────────────────────────────────────────────────────────── */
  userMaxLot?: number | null;
  userMaxRiskPct?: number | null;
  userMaxTradesPerDay?: number | null;
  /**
   * What this order risks from entry to stop, as a percent of equity.
   *
   * `null` means it could not be worked out — no stop, or no equity to
   * measure against. When the trader set a risk ceiling, an unattended order
   * whose risk is unknown is refused rather than guessed at: a limit you
   * enforce only when the numbers happen to be there is not a limit.
   */
  riskPct?: number | null;
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
        | "risk_above_limit"
        | "risk_unknown"
        | "daily_loss_reached"
        | "daily_loss_unknown"
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
  const userMaxLot = input.userMaxLot ?? null;
  const lotCeiling = tighter(profile.maxLot, userMaxLot);
  if (lotCeiling !== null && volumeLots > lotCeiling) {
    // Name whose cap it was: "raise the limit" means two different screens
    // depending on the answer.
    const whose =
      userMaxLot !== null && userMaxLot === lotCeiling && lotCeiling !== profile.maxLot
        ? `your own ${lotCeiling}-lot limit`
        : `your ${lotCeiling}-lot limit for this account`;
    return {
      allowed: false,
      reason: "lot_above_limit",
      detail: `Not placed: ${volumeLots} lots is above ${whose}. Lower your default size or raise the limit — AXE will not quietly place something smaller than you asked for.`,
    };
  }

  // 2b. Risk per trade, which is the number a trader actually feels. Only the
  //     trader sets this one; the broker has no opinion about it.
  const userMaxRiskPct = input.userMaxRiskPct ?? null;
  if (userMaxRiskPct !== null) {
    const riskPct = input.riskPct ?? null;
    if (riskPct === null) {
      return {
        allowed: false,
        reason: "risk_unknown",
        detail: `Not placed: you capped risk at ${userMaxRiskPct}% per trade and AXE cannot work out what this one risks — it needs a stop loss and a known account balance. A limit that only applies when the numbers happen to be there is not a limit.`,
      };
    }
    if (riskPct > userMaxRiskPct) {
      return {
        allowed: false,
        reason: "risk_above_limit",
        detail: `Not placed: this trade risks ${riskPct.toFixed(2)}% of the account and your cap is ${userMaxRiskPct}%. Move the stop or lower the size yourself — AXE will not resize a trade you specified.`,
      };
    }
  }

  // 3. The day's damage. Trading on past a loss cap is how a funded account ends.
  // Fail-closed: a configured daily limit with no measurable day result means
  // refuse — never treat missing equity data as "fine".
  if (profile.maxDailyLossPct !== null && dayResultPct === null) {
    return {
      allowed: false,
      reason: "daily_loss_unknown",
      detail: `Not placed: this account's daily loss limit is ${profile.maxDailyLossPct}% and AXE cannot measure today's equity path. Missing risk data means no new order.`,
    };
  }
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
  const tradeCap =
    tighter(MAX_AUTO_TRADES_PER_DAY, input.userMaxTradesPerDay ?? null) ?? MAX_AUTO_TRADES_PER_DAY;
  if (!input.attended && autoTradesToday >= tradeCap) {
    return {
      allowed: false,
      reason: "daily_trade_cap",
      detail: `Not placed: AXE has already placed ${autoTradesToday} automated trades today, which is the daily cap of ${tradeCap}. Anything further is yours to place by hand.`,
    };
  }

  return { allowed: true };
}

/**
 * The tighter of two ceilings, where null means "no ceiling from this side".
 *
 * Both the account and the trader get to say no. Taking the smaller one is the
 * only answer that respects both. Duplicated from autonomy.ts on purpose: this
 * file deliberately has no runtime imports, and three lines of arithmetic are
 * cheaper to keep honest than the alternative.
 */
function tighter(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** Friday, within three hours of the 21:00 UTC close. */
function isWeekendEdge(now: Date): boolean {
  if (now.getUTCDay() !== 5) return false;
  const hour = now.getUTCHours();
  return hour >= 18 && hour < 21;
}
