import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasEntitlementFeature } from "@/lib/billing/access";
import type { AxeFeature } from "@/lib/billing/features";
import { requiredPlanLabelForFeature } from "@/lib/billing/features";
import { getUserAxeEntitlement } from "@/services/billingService";

export async function requireEntitlementFeature(
  supabase: SupabaseClient,
  userId: string,
  feature: AxeFeature,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ent = await getUserAxeEntitlement(supabase, userId);
  if (!hasEntitlementFeature(ent, feature, userId)) {
    return {
      ok: false,
      status: 403,
      error: `${requiredPlanLabelForFeature(feature)} feature — upgrade at /upgrade`,
    };
  }
  return { ok: true };
}
