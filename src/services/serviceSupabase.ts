import { isMockDataSource } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createEdgeSupabaseClient } from "@/lib/supabase/edge";

export const SERVICES_USE_MOCK_DATA = isMockDataSource();

/**
 * getUser with timeout — prevent infinite hangs on Supabase auth.
 * If Supabase auth takes > 8s, return null so app falls back to demo mode.
 */
async function getUserWithTimeout(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  timeoutMs: number = 8000
) {
  if (!supabase) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const { data, error } = await supabase.auth.getUser();
    clearTimeout(timeoutId);

    if (error) {
      console.warn("[serviceSupabase] getUser error:", error.message);
      return null;
    }
    if (!data?.user) {
      console.warn("[serviceSupabase] getUser returned no user");
      return null;
    }

    // Log success with user ID (not email, for privacy)
    console.log(`[serviceSupabase] getUser OK, user.id: ${data.user.id.substring(0, 8)}...`);
    return data.user;
  } catch (err) {
    console.error("[serviceSupabase] getUser threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Authenticated server Supabase (user session + anon key, RLS). Not the service role. */
export async function getAuthedServiceSupabase() {
  if (SERVICES_USE_MOCK_DATA) {
    console.log("[serviceSupabase] Using mock data, returning null for auth");
    return null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    console.warn("[serviceSupabase] createServerSupabaseClient returned null");
    return null;
  }

  const user = await getUserWithTimeout(supabase, 8000);
  if (!user) {
    console.warn("[serviceSupabase] getUserWithTimeout returned null, falling back to demo");
    return null;
  }

  console.log(`[serviceSupabase] Auth OK: user ${user.id.substring(0, 8)}...`);
  return { supabase, user };
}

/** Edge-compatible authenticated Supabase (for Edge Functions). */
export async function getEdgeAuthedServiceSupabase(request: Request) {
  if (SERVICES_USE_MOCK_DATA) return null;
  const supabase = createEdgeSupabaseClient(request);
  if (!supabase) return null;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    console.warn("[edge-auth] getUser failed or returned no user");
    return null;
  }
  return { supabase, user };
}
