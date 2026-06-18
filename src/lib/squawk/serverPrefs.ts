import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeSquawkStationIds, SQUAWK_STATION_IDS } from "@/lib/squawk/prefs";

export async function getSquawkStationIdsServerState(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [...SQUAWK_STATION_IDS];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [...SQUAWK_STATION_IDS];

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("squawk_station_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  const raw = data?.squawk_station_ids;
  if (!Array.isArray(raw)) return [...SQUAWK_STATION_IDS];
  return normalizeSquawkStationIds(raw as string[]);
}
