import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import { canVoteOnRoadmap } from "@/lib/roadmap/eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ent = await getUserAxeEntitlement(supabase, user.id);
  const canVote = canVoteOnRoadmap(ent.plan, ent.founderBadge);

  const { data: items, error } = await supabase
    .from("axe_roadmap_items")
    .select("id,slug,title,description,status,sort_order")
    .neq("status", "dropped")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[roadmap] list failed:", error.message);
    return NextResponse.json({ error: "Could not load roadmap." }, { status: 500 });
  }

  const ids = (items ?? []).map((i) => i.id as string);
  let voteCounts: Record<string, number> = {};
  let myVotes = new Set<string>();

  if (ids.length) {
    const { data: votes } = await supabase
      .from("axe_roadmap_votes")
      .select("item_id,user_id")
      .in("item_id", ids);
    for (const v of votes ?? []) {
      const id = v.item_id as string;
      voteCounts[id] = (voteCounts[id] ?? 0) + 1;
      if (v.user_id === user.id) myVotes.add(id);
    }
  }

  return NextResponse.json({
    ok: true,
    canVote,
    items: (items ?? []).map((i) => ({
      ...i,
      vote_count: voteCounts[i.id as string] ?? 0,
      voted_by_me: myVotes.has(i.id as string),
    })),
  });
}
