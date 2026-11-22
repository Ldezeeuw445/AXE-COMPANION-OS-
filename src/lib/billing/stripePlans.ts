import "server-only";

import { isAxePlanId, type AxePlanId } from "@/lib/billing/tiers";

/** Map Stripe price IDs (env) → AXE plan. */
export function resolvePlanFromStripePriceId(priceId: string | null | undefined): AxePlanId | null {
  if (!priceId) return null;
  const entries: Array<[string | undefined, AxePlanId]> = [
    [process.env.STRIPE_PRICE_CORE?.trim(), "core"],
    [process.env.STRIPE_PRICE_PRO?.trim(), "pro"],
    [process.env.STRIPE_PRICE_FOUNDER?.trim(), "founder"],
    [process.env.STRIPE_PRICE_ELITE?.trim(), "elite"],
    // Legacy single-price deployments
    [process.env.STRIPE_PRICE_ID?.trim(), "pro"],
  ];
  for (const [envPrice, plan] of entries) {
    if (envPrice && envPrice === priceId) return plan;
  }
  return null;
}

export function resolvePlanFromCheckoutMetadata(
  metadata: Record<string, string> | null | undefined,
): AxePlanId | null {
  const raw = metadata?.axe_plan?.trim().toLowerCase();
  // Any paid plan (core, pro, founder, elite); never "free" from a checkout.
  return isAxePlanId(raw) && raw !== "free" ? raw : null;
}
