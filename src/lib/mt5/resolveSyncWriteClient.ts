import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

/**
 * TOS-SEC-2 prep: MT5 sync writes must not depend on end-user INSERT/UPDATE
 * grants on `broker_trades` / `user_broker_accounts`. Prefer the service-role
 * client so those RLS write policies can be removed later.
 *
 * Ownership is still enforced by the caller (user session read + userId filter).
 */
export function resolveMt5SyncWriteClient(
  sessionClient: SupabaseClient,
): { client: SupabaseClient; viaServiceRole: boolean } {
  const service = createServiceRoleSupabaseClient();
  if (service) return { client: service, viaServiceRole: true };
  return { client: sessionClient, viaServiceRole: false };
}
