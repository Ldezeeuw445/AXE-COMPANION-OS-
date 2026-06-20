import { isPaidAxePlan, type AxePlanId } from "@/lib/billing/tiers";

/** Companion capabilities gated behind Pro / Founder / Elite. */
export type AxeFeature =
  | "unlimited_chat"
  | "cockpit_learning"
  | "learning_arc"
  | "trade_preparation"
  | "chart_actions"
  | "proactive_notifications"
  | "push_notifications"
  | "advanced_memory"
  | "vector_rag_memory"
  | "multi_account"
  | "full_auto_journal"
  | "full_indicators"
  | "advanced_intel"
  | "account_health"
  | "briefings"
  | "pair_awareness"
  | "trading_space_context";

const PRO_FEATURES = new Set<AxeFeature>([
  "unlimited_chat",
  "cockpit_learning",
  "learning_arc",
  "trade_preparation",
  "chart_actions",
  "proactive_notifications",
  "push_notifications",
  "advanced_memory",
  "vector_rag_memory",
  "multi_account",
  "full_auto_journal",
  "full_indicators",
  "advanced_intel",
  "account_health",
  "briefings",
  "pair_awareness",
  "trading_space_context",
]);

export function normalizeAxePlan(plan: string | null | undefined): AxePlanId {
  if (plan === "pro" || plan === "founder" || plan === "elite") return plan;
  return "free";
}

/** Pro, Founder, and Elite share the same Companion feature gates today. */
export function hasAxeFeature(plan: string | null | undefined, feature: AxeFeature): boolean {
  if (plan === "exempt") return true;
  const normalized = normalizeAxePlan(plan);
  if (!isPaidAxePlan(normalized)) return false;
  return PRO_FEATURES.has(feature);
}

export function requiredPlanLabelForFeature(feature: AxeFeature): string {
  return PRO_FEATURES.has(feature) ? "Pro" : "Free";
}
