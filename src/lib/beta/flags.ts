/**
 * Closed / early beta access by plan — matches pricing-page promises:
 * - Founder: Early feature access, Closed beta access
 * - Elite: Early feature access, Beta feature access
 * - Pro/Free: only betas explicitly listed for Pro (e.g. push)
 */

import type { AxePlanId } from "@/lib/billing/tiers";
import type { AxeFeature } from "@/lib/billing/features";

export type BetaFeatureId =
  | "push_alerts"
  | "trading_os_bridge"
  | "premium_voice_preview";

export type BetaFeatureDef = {
  id: BetaFeatureId;
  label: string;
  /** Plans that may use this beta while it is flagged closed/early. */
  plans: readonly AxePlanId[];
  axeFeature?: AxeFeature;
};

export const BETA_FEATURES: readonly BetaFeatureDef[] = [
  {
    id: "push_alerts",
    label: "Push alerts",
    plans: ["founder", "elite", "pro"],
    axeFeature: "push_notifications",
  },
  {
    id: "trading_os_bridge",
    label: "Trading OS desk bridge (closed beta)",
    plans: ["founder", "elite"],
  },
  {
    id: "premium_voice_preview",
    label: "Premium voice preview",
    plans: ["founder", "elite"],
  },
] as const;

export function canAccessBeta(featureId: BetaFeatureId, plan: AxePlanId): boolean {
  const def = BETA_FEATURES.find((f) => f.id === featureId);
  if (!def) return false;
  return def.plans.includes(plan);
}

/** Founder + Elite get early/closed beta bags from the pricing page. */
export function hasEarlyBetaAccess(plan: AxePlanId): boolean {
  return plan === "founder" || plan === "elite";
}
