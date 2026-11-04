/**
 * AXE Companion pricing — product source of truth for UI, entitlements, and Stripe.
 *
 * Copy-only clarity rules (customer feedback 2026-10-29):
 * - Do NOT change prices or which features sit in which tier.
 * - Translate internal tech (RAG, vector, provider names) into customer value.
 * - Mark Elite items that are not shipping today as Roadmap.
 *
 * Signed off by Luka (2026-10-29):
 * - Fair-use soft ceilings: Pro 200/day, Founder & Elite 500/day (friendly notice, not a hard surprise block).
 * - Live broker accounts: Free 1, Pro 3, Founder 5, Elite 10.
 * - MetaApi cloud connection is included in the subscription (no AXE surcharge).
 * - Founder: keep €40 forever while continuously subscribed; badge survives cancel;
 *   returning later pays the normal rate (not the Founder lock).
 * - Demo session: honest placeholder until a 60–90s recording lands in public/marketing/.
 *
 * Enforcement (2026-10-29): chat soft ceilings and live-account caps are hard-gated
 * in Supabase RPCs + connect actions. Chat day boundary is UTC. At the chat limit
 * the API returns a friendly notice (reset time + upgrade where relevant), not a
 * hard scare error. Live caps apply only when CONNECTING a *new* live account;
 * existing accounts above the cap are grandfathered (never disconnected / blocked).
 */

export type AxePlanId = "free" | "pro" | "founder" | "elite";

export const FOUNDER_SEAT_CAP = 100;

/** @deprecated Prefer fairUseSoftCapForPlan(plan) — kept for older imports. */
export const PAID_CHAT_FAIR_USE_SOFT_CAP_PER_DAY = 500;

export type AxeBillingTier = {
  id: AxePlanId;
  label: string;
  priceEurMonthly: number | null;
  /**
   * Hard daily AXE chat sends in product copy / Free enforcement.
   * null = no hard daily cap (paid fair-use soft ceiling applies instead).
   */
  dailyChatCap: number | null;
  /** Soft fair-use ceiling (sends/day). Friendly notice at the limit — not a hard surprise block. */
  fairUseSoftCapPerDay: number | null;
  /** Max live broker accounts (demo/paper unlimited on every plan). */
  liveAccountsCap: number;
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
    fairUseSoftCapPerDay: null,
    liveAccountsCap: 1,
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
    fairUseSoftCapPerDay: 200,
    liveAccountsCap: 3,
    stripePriceIdEnv: "STRIPE_PRICE_PRO",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO",
    badge: "Recommended",
    headline: "Full AXE Companion — unlimited chat and the complete workflow stack.",
    includes: [
      "Everything in Free",
      "Unlimited AXE queries — fair use soft ceiling 200 sends/day (plenty for daily trading; friendly notice at the limit)",
      "Full Cockpit access",
      "Learning Arc",
      "Trade preparation",
      "Chart actions",
      "Pair awareness",
      "Trading space context",
      "Push notifications",
      "Full auto journal",
      "Full indicator suite",
      "Up to 3 live broker accounts",
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
    fairUseSoftCapPerDay: 500,
    liveAccountsCap: 5,
    stripePriceIdEnv: "STRIPE_PRICE_FOUNDER",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_FOUNDER",
    badge: "100 spots",
    headline: "Everything in Pro — plus permanent Founder status (limited to 100).",
    includes: [
      "Everything in Pro",
      "Up to 5 live broker accounts",
      "Fair use soft ceiling 500 AXE sends/day (plenty for daily trading; friendly notice at the limit)",
    ],
    extraBenefits: [
      "Founder badge (kept even if you cancel)",
      "Keep your Founder price (€40/mo) forever while you stay subscribed",
      "Priority support",
      "Early access features",
      "Founder Discord access",
      "Direct product feedback channel",
      "Roadmap voting access",
      "Closed beta feature access",
      "Trading OS Founder pricing eligibility (€69/mo vs €79/mo) while subscribed",
    ],
    notes: [
      "Maximum 100 Founder memberships.",
      "Once sold out, Founder is permanently removed and Elite opens for new upgrades.",
      "Cancel keeps your Founder badge. If you return later you pay the normal rate — the price lock only holds while you stay subscribed.",
    ],
  },
  {
    id: "elite",
    label: "Elite",
    priceEurMonthly: 50,
    dailyChatCap: null,
    fairUseSoftCapPerDay: 500,
    liveAccountsCap: 10,
    stripePriceIdEnv: "STRIPE_PRICE_ELITE",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ELITE",
    headline: "Everything in Pro — premium support and early access (no Founder perks).",
    includes: [
      "Everything in Pro",
      "Up to 10 live broker accounts",
      "Fair use soft ceiling 500 AXE sends/day (plenty for daily trading; friendly notice at the limit)",
    ],
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

export function fairUseSoftCapForPlan(plan: AxePlanId | string | null | undefined): number | null {
  if (plan === "pro" || plan === "founder" || plan === "elite") {
    return tierById(plan).fairUseSoftCapPerDay;
  }
  return null;
}

export function liveAccountsCapForPlan(plan: AxePlanId | string | null | undefined): number {
  if (plan === "pro" || plan === "founder" || plan === "elite") {
    return tierById(plan).liveAccountsCap;
  }
  return tierById("free").liveAccountsCap;
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
