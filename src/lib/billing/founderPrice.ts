/**
 * Founder lock-in: €40 only while the Founder subscription is continuous.
 * Cancelling keeps the Founder badge; returning later pays the normal rate
 * (Elite/Pro payment links — never the Founder payment link again).
 *
 * Continuous = current plan is already `founder`.
 * First-time = no founder_badge yet AND a Founder seat is still available.
 * Returning badge-holder (plan !== founder) is NOT eligible for founder price.
 */

import type { AxePlanId } from "@/lib/billing/tiers";
import type { UserAxeEntitlement } from "@/lib/billing/types";

type EntitlementSlice = Pick<UserAxeEntitlement, "plan" | "founderBadge">;

export function isEligibleForFounderPrice(ent: EntitlementSlice): boolean {
  if (ent.plan === "founder") return true;
  if (ent.founderBadge) return false;
  return true; // first-time; seat availability is checked separately at checkout
}

/**
 * Which paid checkout tier to offer when the UI asked for `requested`.
 * Returning Founders who pick Founder are steered to Elite (same price band
 * after Founder seats fill) without changing listed prices.
 */
export function checkoutTierForRequest(
  requested: AxePlanId,
  ent: EntitlementSlice,
): AxePlanId {
  if (requested !== "founder") return requested;
  if (isEligibleForFounderPrice(ent)) return "founder";
  return "elite";
}

/** Copy shown when a returning Founder sees Elite instead of Founder price. */
export const FOUNDER_RETURN_PRICE_NOTICE =
  "Your Founder badge stays. After a cancel, returning locks in at the normal rate — Founder pricing is only for continuous Founder subscriptions.";
