import type { UserAxeEntitlement } from "@/lib/billing/types";
import { isPaidAxePlan, type AxePlanId } from "@/lib/billing/tiers";
import { type AxeFeature, hasAxeFeature, normalizeAxePlan } from "@/lib/billing/features";

/** Comma-separated auth user UUIDs with full Companion access (owner/dev accounts). */
export function isFullAccessUserId(userId: string): boolean {
  const raw = process.env.AXE_FULL_ACCESS_USER_IDS ?? process.env.AXE_UNLIMITED_CHAT_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

/** Plan string used for feature-gate checks (maps paid/exempt → pro+). */
export function featurePlanForEntitlement(ent: UserAxeEntitlement, userId?: string): AxePlanId | "exempt" {
  if (isFullAccessUserId(userId ?? "")) return "founder";
  if (ent.chatQuotaExempt) return "founder";
  if (ent.founderBadge || ent.plan === "founder") return "founder";
  if (ent.plan === "elite") return "elite";
  if (ent.isPaid || isPaidAxePlan(ent.plan)) {
    return ent.plan === "free" ? "pro" : ent.plan;
  }
  return normalizeAxePlan(ent.plan);
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
