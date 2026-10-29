import type { AxePlanId } from "@/lib/billing/tiers";

/** Founder + Elite get priority support (pricing-page promise). No SLA hours promised. */
export function isPrioritySupportPlan(plan: AxePlanId): boolean {
  return plan === "founder" || plan === "elite";
}

export type SupportTicketStatus = "open" | "pending" | "closed";

export type SupportTicketRow = {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  plan: string;
  founder_badge: boolean;
  priority: boolean;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
};

/** Admin sort: priority first, then newest. */
export function compareSupportTicketsForAdmin(
  a: Pick<SupportTicketRow, "priority" | "created_at">,
  b: Pick<SupportTicketRow, "priority" | "created_at">,
): number {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  return b.created_at.localeCompare(a.created_at);
}
