/**
 * AXE Companion pricing — product source of truth for UI, entitlements, and Stripe.
 */

export type AxePlanId = "free" | "pro" | "founder" | "elite";

export const FOUNDER_SEAT_CAP = 100;

export type AxeBillingTier = {
  id: AxePlanId;
  label: string;
  priceEurMonthly: number | null;
  /** Daily AXE chat sends; null = unlimited (fair use). */
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
      "1 live trading account",
      "Unlimited demo accounts",
      "Basic charting",
      "Basic journal (manual — not AXE auto-journal)",
      "Weekly market snapshot",
      "Up to 20 AXE queries per day",
      "Basic indicators",
      "Basic news feed",
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
      "Unlimited AXE queries (fair use)",
      "Full Cockpit access",
      "Learning Arc",
      "Trade preparation",
      "Chart actions",
      "Pair awareness",
      "Trading space context",
      "Push notifications",
      "Full auto journal",
      "Full indicator suite",
      "Multi-account support",
      "Daily + 1 weekly briefing",
      "Persistent memory",
      "Vector RAG memory",
      "Advanced news & intelligence",
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
      "Founder badge (permanent)",
      "Founder status (permanent)",
      "Priority support",
      "Early access features",
      "Founder Discord access",
      "Direct product feedback channel",
      "Roadmap voting access",
      "Closed beta feature access",
      "Lifetime Founder pricing lock",
      "Trading OS Founder pricing eligibility (€69/mo vs €79/mo)",
    ],
    notes: [
      "Maximum 100 Founder memberships.",
      "Once sold out, Founder is permanently removed and Elite opens for new upgrades.",
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
      "Advanced AI models (when available)",
      "Premium voice features (future)",
      "Increased AI limits (future)",
    ],
    notes: [
      "No Founder badge or Founder status.",
      "No Trading OS Founder pricing eligibility.",
      "Available only after all 100 Founder spots are taken.",
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
