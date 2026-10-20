import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

/**
 * TOS-SEC-2: MT5 / hub account writes must not depend on end-user INSERT/UPDATE
 * grants on `broker_trades` / `user_broker_accounts`. Prefer the service-role
 * client so authenticated RLS can stay SELECT-only
 * (`20260705120000_tos_sec2_broker_tables_select_only.sql`).
 *
 * Ownership is still enforced by the caller (user session read + userId filter).
 * Session fallback exists for local/dev without a service key — after the
 * SELECT-only migration is applied, that fallback cannot mutate these tables.
 */
export function resolveMt5SyncWriteClient(
  sessionClient: SupabaseClient,
): { client: SupabaseClient; viaServiceRole: boolean } {
  const service = createServiceRoleSupabaseClient();
  if (service) return { client: service, viaServiceRole: true };
  return { client: sessionClient, viaServiceRole: false };
}
