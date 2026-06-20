import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FOUNDER_SEAT_CAP,
  isEliteTierAvailable,
  isFounderTierAvailable,
  isPaidAxePlan,
  planDisplayLabel,
  type AxePlanId,
} from "@/lib/billing/tiers";
import { normalizeAxePlan } from "@/lib/billing/features";

import type { UserAxeEntitlement, BillingCatalogState } from "@/lib/billing/types";

const ENTITLEMENT_SELECT =
  "plan, pro_until, chat_quota_exempt, founder_badge, stripe_customer_id, stripe_subscription_id";

export async function getUserAxeEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserAxeEntitlement> {
  const { data } = await supabase
    .from("axe_user_entitlements")
    .select(ENTITLEMENT_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  const plan = normalizeAxePlan(data?.plan as string | undefined);
  const proUntil = (data?.pro_until as string | null) ?? null;
  const chatQuotaExempt = data?.chat_quota_exempt === true;
  const founderBadge = data?.founder_badge === true;
  const paidUntilActive = proUntil ? new Date(proUntil) > new Date() : false;

  const isPaid =
    chatQuotaExempt ||
    isPaidAxePlan(plan) ||
    (plan === "free" && paidUntilActive);

  return {
    plan: isPaid && plan === "free" && paidUntilActive ? "pro" : plan,
    isPaid,
    founderBadge,
    proUntil,
    chatQuotaExempt,
    label:
      founderBadge || plan === "founder"
        ? "Founder"
        : plan === "elite"
          ? "Elite"
          : isPaid && plan === "free"
            ? "Pro"
            : planDisplayLabel(plan),
  };
}

export async function getFounderSeatsUsed(
  supabase: SupabaseClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("axe_user_entitlements")
    .select("user_id", { count: "exact", head: true })
    .eq("founder_badge", true);

  if (error) {
    console.error("[billingService] founder seat count failed", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getBillingCatalogState(
  supabase: SupabaseClient,
): Promise<BillingCatalogState> {
  const founderSeatsUsed = await getFounderSeatsUsed(supabase);
  return {
    founderSeatsUsed,
    founderSeatsCap: FOUNDER_SEAT_CAP,
    founderAvailable: isFounderTierAvailable(founderSeatsUsed),
    eliteAvailable: isEliteTierAvailable(founderSeatsUsed),
  };
}

export function paymentLinkForTier(
  tierId: AxePlanId,
  userId: string | null,
): string | null {
  const envKey =
    tierId === "pro"
      ? process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO?.trim() ||
        process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim()
      : tierId === "founder"
        ? process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_FOUNDER?.trim()
        : tierId === "elite"
          ? process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ELITE?.trim()
          : null;

  if (!envKey || !userId) return envKey ?? null;

  try {
    const url = new URL(envKey);
    url.searchParams.set("client_reference_id", userId);
    return url.toString();
  } catch {
    const sep = envKey.includes("?") ? "&" : "?";
    return `${envKey}${sep}client_reference_id=${encodeURIComponent(userId)}`;
  }
}

export function isBillingConfiguredForTier(tierId: AxePlanId): boolean {
  return Boolean(paymentLinkForTier(tierId, "preview"));
}
