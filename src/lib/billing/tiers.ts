/**
 * AXE Companion pricing — product source of truth for UI, entitlements, and Stripe.
 *
 * Prices (Luka, 2026-11-22 — Trading OS and AXE Companion become one subscription):
 *   Free €0 (desk only) · Core €29 · Pro €39 · Founder €59 (100 seats) · Elite €89.
 *   Existing subscribers keep the price they signed up at (Stripe keeps their price).
 *
 * Copy-only clarity rules (customer feedback 2026-10-29):
 * - Do NOT change which features sit in which tier without Luka.
 * - Translate internal tech (RAG, vector, provider names) into customer value.
 * - Mark Elite items that are not shipping today as Roadmap.
 *
 * Signed off by Luka (2026-10-29):
 * - Fair-use soft ceilings: Pro 200/day, Founder & Elite 500/day (friendly notice, not a hard surprise block).
 * - Live broker accounts: Free 1, Core 1, Pro 3, Founder 5, Elite 10. Core: 50 AXE sends/day.
 * - MetaApi cloud connection is included in the subscription (no AXE surcharge).
 * - Founder: keep €59 forever while continuously subscribed; badge survives cancel;
 *   returning later pays the normal rate (not the Founder lock).
 * - Demo session: honest placeholder until a 60–90s recording lands in public/marketing/.
 *
 * Enforcement (2026-10-29): chat soft ceilings and live-account caps are hard-gated
 * in Supabase RPCs + connect actions. Chat day boundary is UTC. At the chat limit
 * the API returns a friendly notice (reset time + upgrade where relevant), not a
 * hard scare error. Live caps apply only when CONNECTING a *new* live account;
 * existing accounts above the cap are grandfathered (never disconnected / blocked).
 */

export type AxePlanId = "free" | "core" | "pro" | "founder" | "elite";

/** Every plan id, in order: free < core < pro < elite = founder. */
export const AXE_PLAN_IDS: readonly AxePlanId[] = ["free", "core", "pro", "founder", "elite"];

export function isAxePlanId(plan: unknown): plan is AxePlanId {
  return typeof plan === "string" && (AXE_PLAN_IDS as readonly string[]).includes(plan);
}

/** Free and Core are metered plans: a hard daily chat cap, an upgrade offer at the limit. */
export function isMeteredAxePlan(plan: string | null | undefined): boolean {
  return plan !== "pro" && plan !== "founder" && plan !== "elite" && plan !== "exempt";
}

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
    headline: "Trading OS on your desk — free, with capped AXE chat.",
    includes: [
      "Trading OS desk terminal",
      "1 live broker account (MT5 via MetaApi, or Alpaca when configured)",
      "Unlimited demo / paper accounts",
      "Basic charting",
      "Basic journal (manual — not AXE auto-journal)",
      "Up to 20 AXE queries per day",
      "Basic indicators",
      "Basic news feed (included — no own API keys)",
      "1 custom workspace",
    ],
    restrictions: [
      "No AXE Companion on your phone",
      "No Cockpit learning",
      "No trade preparation",
      "No proactive notifications",
      "No chart actions",
      "No advanced memory",
      "No multi-account management",
    ],
  },
  {
    id: "core",
    label: "Core",
    priceEurMonthly: 29,
    dailyChatCap: 50,
    fairUseSoftCapPerDay: null,
    liveAccountsCap: 1,
    stripePriceIdEnv: "STRIPE_PRICE_CORE",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_CORE",
    headline: "Desk and phone — the full workflow with a daily AXE allowance.",
    includes: [
      "Everything in Free",
      "AXE Companion on your phone",
      "Up to 50 AXE queries per day",
      "Full Cockpit access, Learning Arc and trade preparation",
      "Chart actions",
      "Push notifications",
      "Up to 20 price alerts",
      "Full auto journal",
      "Daily + weekly briefing",
      "1 live broker account",
      "Up to 5 custom workspaces",
    ],
    restrictions: ["No unlimited AXE chat", "No multi-account management"],
  },
  {
    id: "pro",
    label: "Pro",
    priceEurMonthly: 39,
    dailyChatCap: null,
    fairUseSoftCapPerDay: 200,
    liveAccountsCap: 3,
    stripePriceIdEnv: "STRIPE_PRICE_PRO",
    stripePaymentLinkEnv: "NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO",
    badge: "Recommended",
    headline: "Full desk and phone — unlimited AXE chat and the complete workflow stack.",
    includes: [
      "Everything in Core",
      "Unlimited AXE queries — fair use soft ceiling 200 sends/day (plenty for daily trading; friendly notice at the limit)",
      "Pair awareness",
      "Trading space context",
      "Full indicator suite",
      "Up to 3 live broker accounts",
      "Unlimited alerts and custom workspaces",
      "Persistent memory of your journal, rules and chat",
      "AXE remembers your trading context across sessions",
      "Advanced news & intelligence (included; no extra keys for default feed)",
      "Account health monitoring",
    ],
  },
  {
    id: "founder",
    label: "Founder",
    priceEurMonthly: 59,
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
      "Keep your Founder price (€59/mo) forever while you stay subscribed",
      "Priority support",
      "Early access features",
      "Founder Discord access",
      "Direct product feedback channel",
      "Roadmap voting access",
      "Closed beta feature access",
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
    priceEurMonthly: 89,
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
      "Available only after all 100 Founder spots are taken.",
      "Roadmap items are not current benefits — they ship when ready.",
    ],
  },
];

/** One subscription covers both apps: every paid plan includes the Trading OS desk and AXE Companion on the phone. */
export const ONE_SUBSCRIPTION_NOTE =
  "One subscription for both apps: Trading OS on your desk and AXE Companion on your phone, on the same login.";

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
  if (plan === "core" || plan === "pro" || plan === "founder" || plan === "elite") {
    return tierById(plan).liveAccountsCap;
  }
  return tierById("free").liveAccountsCap;
}

export const PAID_AXE_PLANS = new Set<AxePlanId>(["core", "pro", "founder", "elite"]);

export function isPaidAxePlan(plan: string | null | undefined): boolean {
  return PAID_AXE_PLANS.has(plan as AxePlanId);
}

export function planDisplayLabel(plan: string | null | undefined): string {
  if (plan === "founder") return "Founder";
  if (plan === "elite") return "Elite";
  if (plan === "pro") return "Pro";
  if (plan === "core") return "Core";
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
