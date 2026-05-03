import { isMockDataSource } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const SERVICES_USE_MOCK_DATA = isMockDataSource();

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
