import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { loadSharedEconRows, type SharedEconQueryClient } from "@/lib/market/sharedEconCalendar";
import type { EconomicEvent } from "@/lib/market/marketTypes";

/**
 * Shared Finance Calendar rows (public.econ_calendar_events, owned by Trading OS).
 *
 * In a request: as the signed-in user (RLS SELECT for authenticated).
 * Outside a request (crons: daily briefing, proactive watcher, broadcasts —
 * cookies() throws there): the service-role client. The table holds only
 * public release data, no user rows, so this read exposes nothing per user.
 * [] on any failure → callers use the existing calendar chain.
 */
export async function loadSharedEconomicCalendar(daysAhead: number): Promise<EconomicEvent[]> {
  let client: SharedEconQueryClient | null = null;
  try {
    client = (await createServerSupabaseClient()) as unknown as SharedEconQueryClient | null;
  } catch {
    client = createServiceRoleSupabaseClient() as unknown as SharedEconQueryClient | null;
  }
  return loadSharedEconRows(client, { daysAhead });
}
