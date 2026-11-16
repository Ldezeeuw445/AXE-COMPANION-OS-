import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FOUNDER_SEAT_CAP,
  isEliteTierAvailable,
  isFounderTierAvailable,
  type AxePlanId,
} from "@/lib/billing/tiers";
import { isAnonymousAuthUser } from "@/lib/billing/anonymousUsers";
import { applyAnonymousRule, entitlementFromRow, isPaidShaped } from "@/lib/billing/entitlementCore";

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

  const raw = entitlementFromRow(data);
  // An anonymous auth user is never paid, whatever the row says (see
  // entitlementCore). The auth lookup only runs for paid-looking rows, and is
  // cached, so a free user costs nothing extra.
  if (!isPaidShaped(raw)) return raw;
  return applyAnonymousRule(raw, await isAnonymousAuthUser(userId));
}

export async function getFounderSeatsUsed(
  supabase: SupabaseClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("axe_user_entitlements")
    .select("user_id", { count: "exact", head: true })
    .eq("founder_badge", true)
    .neq("chat_quota_exempt", true);

  if (error) {
    console.error("[billingService] founder seat count failed", error.message);
    // Fail closed — treat as sold out rather than overselling Founder seats.
    return FOUNDER_SEAT_CAP;
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
