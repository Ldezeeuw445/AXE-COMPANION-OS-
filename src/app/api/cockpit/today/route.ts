import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchCockpitTodaySummary } from "@/services/cockpitService";
import { computeTraderScores } from "@/services/traderScoresService";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await requireEntitlementFeature(supabase, user.id, "cockpit_learning");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, upgradeRequired: true }, { status: gate.status });
  }

  const [today, traderScores] = await Promise.all([
    fetchCockpitTodaySummary(supabase, user.id),
    computeTraderScores(supabase, user.id),
  ]);
  return NextResponse.json({ today, traderScores });
}
