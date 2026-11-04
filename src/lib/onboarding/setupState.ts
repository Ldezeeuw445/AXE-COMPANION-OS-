/**
 * What is still missing after onboarding, and what it costs to skip it.
 *
 * Build-list item 10.1: *"Onboarding: tier kiezen → eigen MT5 koppelen, in één
 * flow."* Until now the flow ended at `router.replace("/chart")` with the
 * trader's preferences saved and nothing else — no trading account, no plan
 * chosen, and no mention that either existed. They landed on an empty chart
 * and had to work out for themselves that the app was waiting on them.
 *
 * Two things this is careful not to do:
 *
 *  1. **It does not block.** Someone must be able to look around before
 *     connecting a broker or paying anything. Every gap below is skippable,
 *     and `blocking` is not a field here on purpose.
 *  2. **It does not oversell.** The consequence line says what actually stops
 *     working, not what we would like them to buy. A trader who reads "your
 *     chart will have no prices" and shrugs has made an informed choice; one
 *     who reads "unlock your full potential" has been sold at.
 *
 * Dependency-free apart from the tier list, so the verify suite runs it
 * directly.
 */

import { AXE_BILLING_TIERS, type AxePlanId } from "@/lib/billing/tiers";

export type SetupGapId = "trading-account" | "plan";

export type SetupGap = {
  id: SetupGapId;
  title: string;
  /** What does not work until this is done. Plain, and true. */
  consequence: string;
  /** The in-app screen that closes this gap. */
  href: string;
  /** The words on the button. Imperative, never "Learn more". */
  cta: string;
};

export type SetupFacts = {
  plan: AxePlanId;
  isPaid: boolean;
  /** How many broker accounts the trader has linked, live or demo. */
  tradingAccounts: number;
};

/**
 * The gaps, most consequential first.
 *
 * A missing trading account outranks a missing plan, and that order is a
 * judgement about the trader rather than about revenue: without an account
 * nothing in the app has any data, while on the free plan most of it still
 * works. Putting the paywall first would be the easy inversion and it would
 * be a lie about which one actually stops them.
 */
export function describeSetupGaps(facts: SetupFacts): SetupGap[] {
  const gaps: SetupGap[] = [];

  if (facts.tradingAccounts <= 0) {
    gaps.push({
      id: "trading-account",
      title: "Connect a trading account",
      consequence:
        "Until you do, your chart has no prices, the journal has no trades to read, and AXE has nothing of yours to learn from. A demo account is enough to see all of it working.",
      href: "/accounts",
      cta: "Connect MT5",
    });
  }

  if (!facts.isPaid) {
    const free = AXE_BILLING_TIERS.find((tier) => tier.id === "free");
    const capped = free?.dailyChatCap;
    gaps.push({
      id: "plan",
      title: "You are on Free",
      consequence: capped
        ? `Everything below is yours already. Free stops at ${capped} AXE messages a day, one live account, and manual journalling — the Cockpit learning and proactive alerts are the paid part.`
        : "Everything below is yours already. The Cockpit learning and proactive alerts are the paid part.",
      href: "/upgrade",
      cta: "See the plans",
    });
  }

  return gaps;
}

/**
 * Whether the setup step has anything to say at all.
 *
 * Someone who connected a broker during signup and is already on Pro should
 * not be shown a screen that congratulates them on nothing — the flow skips
 * straight to the chart.
 */
export function hasSetupGaps(facts: SetupFacts): boolean {
  return describeSetupGaps(facts).length > 0;
}
