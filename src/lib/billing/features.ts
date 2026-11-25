import {
  AXE_PLAN_IDS,
  isAxePlanId,
  isPaidAxePlan,
  planDisplayLabel,
  type AxePlanId,
} from "@/lib/billing/tiers";

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

/** Core is paid but metered: everything Pro has except unlimited chat and more than one live account. */
const CORE_FEATURES = new Set<AxeFeature>(
  [...PRO_FEATURES].filter((f) => f !== "unlimited_chat" && f !== "multi_account"),
);

export function normalizeAxePlan(plan: string | null | undefined): AxePlanId {
  return isAxePlanId(plan) ? plan : "free";
}

/** Pro, Founder, and Elite share the same Companion feature gates; Core has a subset. */
export function hasAxeFeature(plan: string | null | undefined, feature: AxeFeature): boolean {
  if (plan === "exempt") return true;
  const normalized = normalizeAxePlan(plan);
  if (!isPaidAxePlan(normalized)) return false;
  if (normalized === "core") return CORE_FEATURES.has(feature);
  return PRO_FEATURES.has(feature);
}

export function requiredPlanLabelForFeature(feature: AxeFeature): string {
  for (const plan of AXE_PLAN_IDS) {
    if (hasAxeFeature(plan, feature)) return planDisplayLabel(plan);
  }
  return "Free";
}
