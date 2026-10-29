import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import { isPrioritySupportPlan } from "@/lib/support/priority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("axe_support_tickets")
    .select("id,subject,body,plan,founder_badge,priority,status,created_at,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[support] list failed:", error.message);
    return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tickets: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with subject and body." }, { status: 400 });
  }
  const subject = String((body as { subject?: unknown })?.subject ?? "").trim();
  const text = String((body as { body?: unknown })?.body ?? "").trim();
  if (subject.length < 1 || subject.length > 200) {
    return NextResponse.json({ error: "Subject must be 1–200 characters." }, { status: 400 });
  }
  if (text.length < 1 || text.length > 8000) {
    return NextResponse.json({ error: "Message must be 1–8000 characters." }, { status: 400 });
  }

  const ent = await getUserAxeEntitlement(supabase, user.id);
  const priority = isPrioritySupportPlan(ent.plan);

  const { data, error } = await supabase
    .from("axe_support_tickets")
    .insert({
      user_id: user.id,
      subject,
      body: text,
      plan: ent.plan,
      founder_badge: ent.founderBadge,
      priority,
      status: "open",
    })
    .select("id,priority,status,created_at")
    .single();

  if (error) {
    console.error("[support] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save that just now." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: data });
}
