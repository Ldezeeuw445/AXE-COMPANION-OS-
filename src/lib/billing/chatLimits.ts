import type { AxePlanId } from "@/lib/billing/tiers";
import { isPaidAxePlan, planDisplayLabel, tierById } from "@/lib/billing/tiers";

/** Chat daily counters use UTC calendar days (aligned with Supabase RPCs). */
export const CHAT_QUOTA_TIMEZONE = "UTC" as const;

function normalizePlan(plan: string | null | undefined): AxePlanId {
  if (plan === "pro" || plan === "founder" || plan === "elite") return plan;
  return "free";
}

/**
 * Enforced daily AXE chat message caps (pricing page soft ceilings for paid).
 * Staff exempt returns -1 (unlimited).
 */
export function enforcedDailyChatLimit(plan: string | null | undefined, exempt = false): number {
  if (exempt) return -1;
  const id = normalizePlan(plan);
  const tier = tierById(id);
  if (id === "free") return tier.dailyChatCap ?? 20;
  return tier.fairUseSoftCapPerDay ?? 200;
}

/** Next midnight UTC as ISO string (for "when it resets" copy). */
export function nextUtcMidnightIso(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0)).toISOString();
}

export function chatQuotaFriendlyNotice(opts: {
  plan?: string | null;
  limit: number;
  used?: number;
}): string {
  const plan = normalizePlan(opts.plan);
  const reset = "Resets at midnight UTC.";
  if (opts.limit <= 0) {
    return `You've reached today's AXE chat allowance. ${reset}`;
  }
  if (!isPaidAxePlan(plan)) {
    return `You've used your ${opts.limit} free AXE messages for today. ${reset} Upgrade for a higher daily allowance.`;
  }
  const label = planDisplayLabel(plan);
  return `You've reached today's ${label} fair-use ceiling (${opts.limit} messages). ${reset}`;
}

export function shouldOfferChatUpgrade(plan?: string | null): boolean {
  return !isPaidAxePlan(normalizePlan(plan));
}
