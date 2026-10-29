import type { AxePlanId } from "@/lib/billing/tiers";

/**
 * Pricing page: Founder exclusive — "Roadmap voting / feature requests".
 * Elite lists roadmap *items* as promises, not voting rights.
 */
export function canVoteOnRoadmap(
  plan: AxePlanId,
  founderBadge: boolean,
): boolean {
  return plan === "founder" || founderBadge;
}

export type RoadmapItemStatus = "planned" | "in_progress" | "shipped" | "dropped";

export type RoadmapItemRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: RoadmapItemStatus;
  sort_order: number;
  vote_count?: number;
  voted_by_me?: boolean;
};
