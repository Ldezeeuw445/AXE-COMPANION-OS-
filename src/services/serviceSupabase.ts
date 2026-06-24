import { isMockDataSource } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createEdgeSupabaseClient } from "@/lib/supabase/edge";

export const SERVICES_USE_MOCK_DATA = isMockDataSource();

/** Authenticated server Supabase (user session + anon key, RLS). Not the service role. */
export async function getAuthedServiceSupabase() {
  if (SERVICES_USE_MOCK_DATA) return null;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
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
  if (error || !user) return null;
  return { supabase, user };
}
