/**
 * AXE Companion subscription tiers — source of truth for UI + Stripe mapping.
 * Stripe product/price IDs are filled from env once created in Dashboard or via MCP.
 */

export type AxePlanId = "free" | "pro" | "founder" | "elite";

export type AxeBillingTier = {
  id: AxePlanId;
  label: string;
  priceEurMonthly: number | null;
  /** null = unlimited / not capped in product copy */
  cap: number | null;
  stripePriceIdEnv?: string;
  stripePaymentLinkEnv?: string;
  badge?: string;
  description: string;
  features: string[];
};

export const AXE_BILLING_TIERS: AxeBillingTier[] = [
  {
    id: "free",
    label: "Free",
    priceEurMonthly: 0,
    cap: 20,
    description: "Full AXE Companion UX with a daily chat ceiling.",
    features: [
      "Full chart, journal, vault, cockpit preview",
      "20 chat sends per day (UTC reset)",
      "Demo + live broker chart stream",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    priceEurMonthly: 20,
    cap: null,
    stripePriceIdEnv: "STRIPE_PRICE_PRO",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO",
    badge: "Recommended",
    description: "Unlimited chat for active traders.",
    features: [
      "Unlimited chat sends (fair use)",
      "Full cockpit + account intelligence",
      "Priority provider mix when wired",
    ],
  },
  {
    id: "founder",
    label: "Founder",
    priceEurMonthly: 40,
    cap: null,
    stripePriceIdEnv: "STRIPE_PRICE_FOUNDER",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_FOUNDER",
    badge: "100 spots",
    description: "Early supporter tier — limited to 100 seats.",
    features: [
      "Everything in Pro",
      "Founder badge + early Trading OS access queue",
      "Direct product feedback channel",
    ],
  },
  {
    id: "elite",
    label: "Elite",
    priceEurMonthly: 50,
    cap: null,
    stripePriceIdEnv: "STRIPE_PRICE_ELITE",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ELITE",
    description: "Top tier for power users.",
    features: [
      "Everything in Founder",
      "Highest priority on new AXE capabilities",
      "Premium intel refresh priority when enabled",
    ],
  },
];

export function tierById(id: AxePlanId): AxeBillingTier {
  return AXE_BILLING_TIERS.find((t) => t.id === id) ?? AXE_BILLING_TIERS[0];
}

/** Paid plans that unlock unlimited chat (same entitlement gate as legacy `pro`). */
export const PAID_AXE_PLANS = new Set<AxePlanId>(["pro", "founder", "elite"]);

export function isPaidAxePlan(plan: string | null | undefined): boolean {
  return PAID_AXE_PLANS.has(plan as AxePlanId);
}
