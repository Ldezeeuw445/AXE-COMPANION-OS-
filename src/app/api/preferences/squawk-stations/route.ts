import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeSquawkStationIds, SQUAWK_STATION_IDS } from "@/lib/squawk/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ stationIds: SQUAWK_STATION_IDS });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ stationIds: SQUAWK_STATION_IDS });

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("squawk_station_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  const raw = data?.squawk_station_ids;
  const stationIds = Array.isArray(raw)
    ? normalizeSquawkStationIds(raw as string[])
    : [...SQUAWK_STATION_IDS];

  return Response.json({ stationIds });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { stationIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const stationIds = normalizeSquawkStationIds(body.stationIds);
  const { error } = await supabase
    .from("user_workspace_preferences")
    .upsert({ user_id: user.id, squawk_station_ids: stationIds }, { onConflict: "user_id" });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, stationIds });
}
