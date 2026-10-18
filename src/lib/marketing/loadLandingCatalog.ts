import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { getBillingCatalogState } from "@/services/billingService";
import type { BillingCatalogState } from "@/lib/billing/types";

/**
 * Founder seats for the public landing. Uses the same counter as checkout
 * (`getFounderSeatsUsed` via `getBillingCatalogState`). Returns null when
 * the service-role client is missing so the page never invents a used count.
 */
export async function loadLandingCatalog(): Promise<BillingCatalogState | null> {
  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return null;
  try {
    return await getBillingCatalogState(supabase);
  } catch (error) {
    console.error("[landing] founder seat catalog failed", error);
    return null;
  }
}
