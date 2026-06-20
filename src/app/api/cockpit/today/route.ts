import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchCockpitTodaySummary } from "@/services/cockpitService";
import { computeTraderScores } from "@/services/traderScoresService";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [todayBase, traderScores] = await Promise.all([
    fetchCockpitTodaySummary(supabase, user.id),
    computeTraderScores(supabase, user.id),
  ]);
  const today = {
    ...todayBase,
    alignmentScore: traderScores.overallAlignment ?? 0,
  };
  return NextResponse.json({ today });
}
