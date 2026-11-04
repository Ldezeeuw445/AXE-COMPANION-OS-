import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { isAdminUser } from "@/lib/admin/isAdmin";
import { compareSupportTicketsForAdmin } from "@/lib/support/priority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isAdminUser({ userId: user.id, email: user.email })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createServiceRoleSupabaseClient();
  if (!admin) return NextResponse.json({ error: "service_role_missing" }, { status: 503 });

  const [{ data: tickets, error: tErr }, { data: feedback, error: fErr }] = await Promise.all([
    admin
      .from("axe_support_tickets")
      .select("id,user_id,subject,body,plan,founder_badge,priority,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("axe_product_feedback")
      .select("id,user_id,body,screenshot_path,plan,founder_tagged,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (tErr || fErr) {
    console.error("[admin/inbox] load failed:", tErr?.message ?? fErr?.message);
    return NextResponse.json({ error: "Could not load inbox." }, { status: 500 });
  }

  const sortedTickets = [...(tickets ?? [])].sort(compareSupportTicketsForAdmin);
  const sortedFeedback = [...(feedback ?? [])].sort((a, b) => {
    if (a.founder_tagged !== b.founder_tagged) return a.founder_tagged ? -1 : 1;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  return NextResponse.json({
    ok: true,
    tickets: sortedTickets,
    feedback: sortedFeedback,
  });
}
