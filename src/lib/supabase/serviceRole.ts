import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client for webhook routes and other server-side
 * contexts that don't have a user session (e.g. Stripe webhooks, scheduled
 * jobs, internal cron). This client BYPASSES Row Level Security — only use
 * it for writes that genuinely need elevated privileges, never to read
 * arbitrary user data on behalf of an authenticated user.
 *
 * Returns null when either the project URL or the service-role key is
 * missing so callers can degrade gracefully instead of crashing on import.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-axe-server": "service-role" },
    },
  });
}
