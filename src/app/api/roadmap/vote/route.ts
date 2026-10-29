import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import { canVoteOnRoadmap } from "@/lib/roadmap/eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ent = await getUserAxeEntitlement(supabase, user.id);
  if (!canVoteOnRoadmap(ent.plan, ent.founderBadge)) {
    return NextResponse.json(
      { error: "Roadmap voting is a Founder benefit." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with itemId." }, { status: 400 });
  }
  const itemId = String((body as { itemId?: unknown })?.itemId ?? "").trim();
  const remove = Boolean((body as { remove?: unknown })?.remove);
  if (!itemId) return NextResponse.json({ error: "itemId required." }, { status: 400 });

  if (remove) {
    const { error } = await supabase
      .from("axe_roadmap_votes")
      .delete()
      .eq("item_id", itemId)
      .eq("user_id", user.id);
    if (error) {
      console.error("[roadmap] unvote failed:", error.message);
      return NextResponse.json({ error: "Could not update vote." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, voted: false });
  }

  const { error } = await supabase.from("axe_roadmap_votes").insert({
    item_id: itemId,
    user_id: user.id,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, voted: true });
    console.error("[roadmap] vote failed:", error.message);
    return NextResponse.json({ error: "Could not save vote." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, voted: true });
}
