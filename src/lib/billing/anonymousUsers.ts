import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAnonymousUser } from "@/lib/auth/anonymousSessions";
import { createAnonymityResolver } from "@/lib/billing/entitlementCore";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

/**
 * Is this auth user anonymous? `true` / `false`, or `null` when it could not be
 * determined. Read-only: `auth.admin.getUserById`, which needs the service
 * role, so it uses the caller's service client when given one.
 */
async function lookupAnonymous(userId: string, client?: SupabaseClient | null): Promise<boolean | null> {
  try {
    const sb = client?.auth?.admin ? client : createServiceRoleSupabaseClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return isAnonymousUser(data.user);
  } catch {
    return null;
  }
}

const cached = createAnonymityResolver((userId) => lookupAnonymous(userId));

/** Cached lookup for request paths. */
export function isAnonymousAuthUser(userId: string): Promise<boolean | null> {
  return cached(userId);
}

/** Uncached lookup against a given service client (cron jobs, webhooks). */
export function lookupAnonymousWith(client: SupabaseClient, userId: string): Promise<boolean | null> {
  return lookupAnonymous(userId, client);
}
