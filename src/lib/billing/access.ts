import type { UserAxeEntitlement } from "@/lib/billing/types";
import { isPaidAxePlan, type AxePlanId } from "@/lib/billing/tiers";
import { type AxeFeature, hasAxeFeature } from "@/lib/billing/features";

/** Comma-separated auth user UUIDs with full Companion access (owner/dev accounts). */
export function isFullAccessUserId(userId: string): boolean {
  const raw = process.env.AXE_FULL_ACCESS_USER_IDS ?? process.env.AXE_UNLIMITED_CHAT_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

/**
 * Plan used for feature-gate checks. Features come from the PLAN (founder /
 * elite / pro) or an active `pro_until` trial — nothing else.
 *
 * `founder_badge` is a permanent marker that survives cancelling; it is not a
 * subscription. `chat_quota_exempt` lifts the daily chat cap and nothing more
 * (the quota RPCs read it; this function does not). Neither unlocks a Pro
 * feature. Until 2026-11-16 both did, so a cancelled Founder kept every Pro
 * route, and every exempt row was a free Founder plan.
 *
 * The owner allow-list (`AXE_FULL_ACCESS_USER_IDS`) is an explicit env switch,
 * not data in the table, and still grants everything.
 */
export function featurePlanForEntitlement(ent: UserAxeEntitlement, userId?: string): AxePlanId | "exempt" {
  if (isFullAccessUserId(userId ?? "")) return "founder";
  if (ent.plan === "founder") return "founder";
  if (ent.plan === "elite") return "elite";
  if (isPaidAxePlan(ent.plan)) return ent.plan;
  // An active pro_until on a free plan is a time-boxed Pro trial.
  if (ent.isPaid) return "pro";
  return "free";
}

export function hasEntitlementFeature(
  ent: UserAxeEntitlement,
  feature: AxeFeature,
  userId?: string,
): boolean {
  return hasAxeFeature(featurePlanForEntitlement(ent, userId), feature);
}

export function hasFullCompanionAccess(ent: UserAxeEntitlement, userId?: string): boolean {
  const fp = featurePlanForEntitlement(ent, userId);
  return fp === "exempt" || isPaidAxePlan(fp as AxePlanId) || fp === "founder" || fp === "elite";
}
