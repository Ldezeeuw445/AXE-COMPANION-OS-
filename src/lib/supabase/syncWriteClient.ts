import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

let warnedFallback = false;

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
 *      stopping it. `src/lib/mt5/syncWriteScope.test.ts` asserts this over the
 *      source.
 *
 * Falls back to the caller's client when no service-role key is configured, so
 * local and preview environments keep working exactly as they do now.
 *
 * In production that fallback is the one way the TOS-SEC-2 revoke turns into an
 * outage (docs/TOS-SEC-2-REVOKE.md): once the trader's write grants are gone the
 * fallback writes are refused, and before that they quietly run on rights that
 * are meant to disappear. Either way nothing else would say so, so it warns —
 * once per process, because this runs on every sync.
 */
export function syncWriteClient(userClient: SupabaseClient): SupabaseClient {
  const elevated = createServiceRoleSupabaseClient();
  if (elevated) return elevated;
  if (process.env.NODE_ENV === "production" && !warnedFallback) {
    warnedFallback = true;
    console.warn(
      "[sync-write] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing: the MT5 sync is writing " +
        "with the trader's own client. This breaks once the TOS-SEC-2 revoke is applied.",
    );
  }
  return userClient;
}

/** Tests only: forget that the fallback warning was already given. */
export function resetSyncWriteFallbackWarning(): void {
  warnedFallback = false;
}

/**
 * Rule 1 for an elevated INSERT. There is no existing row to read back through
 * RLS, so ownership is the session itself: the `user_id` about to be written
 * must be the signed-in user on the caller's client. Without this, a helper
 * that takes `userId` as a parameter could create a row for anyone the moment
 * its insert stops going through RLS.
 */
export async function sessionIsUser(userClient: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const {
    data: { user },
  } = await userClient.auth.getUser();
  return user?.id === userId;
}
