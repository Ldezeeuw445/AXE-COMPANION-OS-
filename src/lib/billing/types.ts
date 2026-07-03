import type { AxePlanId } from "@/lib/billing/tiers";

export type UserAxeEntitlement = {
  plan: AxePlanId;
  isPaid: boolean;
  founderBadge: boolean;
  proUntil: string | null;
  chatQuotaExempt: boolean;
  label: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type BillingCatalogState = {
  founderSeatsUsed: number;
  founderSeatsCap: number;
  founderAvailable: boolean;
  eliteAvailable: boolean;
};
