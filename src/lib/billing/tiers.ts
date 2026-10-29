/**
 * AXE Companion pricing — product source of truth for UI, entitlements, and Stripe.
 *
 * Copy-only clarity rules (customer feedback 2026-10-29):
 * - Do NOT change prices or which features sit in which tier.
 * - Translate internal tech (RAG, vector, provider names) into customer value.
 * - Mark Elite items that are not shipping today as Roadmap.
 *
 * TODO(Luka): Confirm concrete fair-use soft ceiling for paid chat
 *   (proposal below uses 500 AXE sends/day — advise only until signed off).
 * TODO(Luka): Confirm Pro/Founder/Elite live-account caps beyond Free's "1".
 *   Code gates Free to one live account and Pro+ as "multi-account" without a hard number.
 * TODO(Luka): Confirm whether MetaApi cloud resource slots ever bill the customer
 *   separately; landing currently says the AXE plan includes the cloud link.
 * TODO(Luka): Confirm exact meaning of "permanent Founder status" on cancel/return
 *   (badge + price lock retained after cancel? only while seats remain?).
 */

export type AxePlanId = "free" | "pro" | "founder" | "elite";

export const FOUNDER_SEAT_CAP = 100;

/**
 * Soft ceiling shown for paid "unlimited — fair use" chat.
 * TODO(Luka): replace 500 once you pick the real number; keep Free at 20.
 */
export const PAID_CHAT_FAIR_USE_SOFT_CAP_PER_DAY = 500;

export type AxeBillingTier = {
  id: AxePlanId;
  label: string;
  priceEurMonthly: number | null;
  /** Daily AXE chat sends; null = unlimited (fair use soft cap). */
  dailyChatCap: number | null;
  stripePriceIdEnv?: string;
  /** Public Stripe Payment Link env var (legacy Pro uses NEXT_PUBLIC_STRIPE_PAYMENT_LINK). */
  stripePaymentLinkEnv?: string;
  badge?: string;
  headline: string;
  includes: string[];
  restrictions?: string[];
  extraBenefits?: string[];
  notes?: string[];
};

export const AXE_BILLING_TIERS: AxeBillingTier[] = [
  {
    id: "free",
    label: "Free",
    priceEurMonthly: 0,
    dailyChatCap: 20,
    headline: "Start with the full mobile OS — capped chat and core tools.",
    includes: [
      "1 live broker account (MT5 via MetaApi, or Alpaca when configured)",
      "Unlimited demo / paper accounts",
      "Basic charting",
      "Basic journal (manual — not AXE auto-journal)",
      "Weekly market snapshot",
      "Up to 20 AXE queries per day",
      "Basic indicators",
      "Basic news feed (included — no own API keys)",
      "Basic market data",
    ],
    restrictions: [
      "No Cockpit learning",
      "No trade preparation",
      "No proactive notifications",
      "No chart actions",
      "No advanced memory",
      "No multi-account management",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    priceEurMonthly: 20,
    dailyChatCap: null,
    stripePriceIdEnv: "STRIPE_PRICE_PRO",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO",
    badge: "Recommended",
    headline: "Full AXE Companion — unlimited chat and the complete workflow stack.",
    includes: [
      "Everything in Free",
      // TODO(Luka): confirm 500/day soft cap for fair use
      "Unlimited AXE queries — fair use soft cap ~500 sends/day",
      "Full Cockpit access",
      "Learning Arc",
      "Trade preparation",
      "Chart actions",
      "Pair awareness",
      "Trading space context",
      "Push notifications",
      "Full auto journal",
      "Full indicator suite",
      // TODO(Luka): exact live-account count for Pro
      "Multi-account support (several live broker accounts)",
      "Daily + 1 weekly briefing",
      "Persistent memory of your journal, rules and chat",
      "AXE remembers your trading context across sessions",
      "Advanced news & intelligence (included; no extra keys for default feed)",
      "Account health monitoring",
    ],
  },
  {
    id: "founder",
    label: "Founder",
    priceEurMonthly: 40,
    dailyChatCap: null,
    stripePriceIdEnv: "STRIPE_PRICE_FOUNDER",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_FOUNDER",
    badge: "100 spots",
    headline: "Everything in Pro — plus permanent Founder status (limited to 100).",
    includes: ["Everything in Pro"],
    extraBenefits: [
      "Founder badge (kept even if you cancel and later return)",
      "Permanent Founder status — same badge + locked Founder price on return",
      "Priority support",
      "Early access features",
      "Founder Discord access",
      "Direct product feedback channel",
      "Roadmap voting access",
      "Closed beta feature access",
      "Lifetime Founder pricing lock (€40/mo while Founder exists)",
      "Trading OS Founder pricing eligibility (€69/mo vs €79/mo)",
    ],
    notes: [
      "Maximum 100 Founder memberships.",
      "Once sold out, Founder is permanently removed and Elite opens for new upgrades.",
      // TODO(Luka): confirm cancel/return semantics in Stripe + entitlements.
      "Cancel keeps your Founder badge; resubscribing restores the locked Founder price while seats still exist.",
    ],
  },
  {
    id: "elite",
    label: "Elite",
    priceEurMonthly: 50,
    dailyChatCap: null,
    stripePriceIdEnv: "STRIPE_PRICE_ELITE",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ELITE",
    headline: "Everything in Pro — premium support and early access (no Founder perks).",
    includes: ["Everything in Pro"],
    extraBenefits: [
      "Priority support",
      "Early feature access",
      "Beta feature access",
      "Roadmap: Advanced AI models (when available)",
      "Roadmap: Premium voice features",
      "Roadmap: Increased AI limits",
    ],
    notes: [
      "No Founder badge or Founder status.",
      "No Trading OS Founder pricing eligibility.",
      "Available only after all 100 Founder spots are taken.",
      "Roadmap items are not current benefits — they ship when ready.",
    ],
  },
];

/** Future Trading OS SKUs — not sold in Companion checkout yet. */
export const TRADING_OS_FOUNDER_TIER = {
  label: "Trading OS Founder",
  priceEurMonthly: 79,
  axeFounderPriceEurMonthly: 69,
  includes: [
    "Full Trading OS terminal",
    "All intelligence modules",
    "Multi-chart layouts",
    "QuantLab, Intel Center, News & Macro terminals",
    "Sentiment suite & wallet integration",
  ],
} as const;

export function tierById(id: AxePlanId): AxeBillingTier {
  return AXE_BILLING_TIERS.find((t) => t.id === id) ?? AXE_BILLING_TIERS[0];
}

export const PAID_AXE_PLANS = new Set<AxePlanId>(["pro", "founder", "elite"]);

export function isPaidAxePlan(plan: string | null | undefined): boolean {
  return PAID_AXE_PLANS.has(plan as AxePlanId);
}

export function planDisplayLabel(plan: string | null | undefined): string {
  if (plan === "founder") return "Founder";
  if (plan === "elite") return "Elite";
  if (plan === "pro") return "Pro";
  if (plan === "exempt") return "Pro";
  return "Free";
}

export function resolvePaymentLinkEnvKey(tier: AxeBillingTier): string | undefined {
  if (tier.id === "pro") {
    return tier.stripePaymentLinkEnv ?? "NEXT_PUBLIC_STRIPE_PAYMENT_LINK";
  }
  return tier.stripePaymentLinkEnv;
}

export function isEliteTierAvailable(founderSeatsUsed: number): boolean {
  return founderSeatsUsed >= FOUNDER_SEAT_CAP;
}

export function isFounderTierAvailable(founderSeatsUsed: number): boolean {
  return founderSeatsUsed < FOUNDER_SEAT_CAP;
}
