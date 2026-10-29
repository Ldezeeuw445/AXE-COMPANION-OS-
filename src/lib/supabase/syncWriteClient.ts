import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

/**
 * TOS-SEC-2 prep: the client the MT5 sync writes with.
 *
 * The sync is the only thing that writes `broker_trades`, `mt5_positions` and
 * the provider/metadata columns on `user_broker_accounts`. Today it does that
 * with the caller's own user-scoped client, which means every trader must hold
 * INSERT and UPDATE rights on their own broker rows. Those rights exist purely
 * so a background job can use them, and a trader who can write `broker_trades`
 * directly can rewrite their own P&L — which is the ledger AXE scores them on.
 *
 * Routing the writes through the service-role client lets those grants be
 * revoked without breaking the sync. Two rules make that safe, and both are
 * enforced at every call site:
 *
 *   1. Ownership is established *before* any elevated write, by reading the
 *      account through the caller's own RLS-scoped client. If that read comes
 *      back empty the sync returns and nothing is written.
 *   2. Every elevated write still filters on `user_id`, so a wrong id cannot
 *      reach another trader's row even though RLS is no longer the thing
 *      stopping it. `syncCloudAccount.test.ts` asserts this over the source.
 *
 * Falls back to the caller's client when no service-role key is configured, so
 * local and preview environments keep working exactly as they do now.
 */
export function syncWriteClient(userClient: SupabaseClient): SupabaseClient {
  return createServiceRoleSupabaseClient() ?? userClient;
}
