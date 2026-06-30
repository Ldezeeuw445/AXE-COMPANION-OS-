import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ instant: false });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ instant: false });

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("instant_sl_tp_modify")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({ instant: Boolean(data?.instant_sl_tp_modify) });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { instant?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const instant = Boolean(body.instant);

  if (instant) {
    const { data: pref } = await supabase
      .from("user_workspace_preferences")
      .select("live_trading_enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pref?.live_trading_enabled) {
      return Response.json(
        { error: "Enable Live trading first (3-step risk confirmation) before instant drag release." },
        { status: 403 },
      );
    }
  }

  const { error } = await supabase
    .from("user_workspace_preferences")
    .upsert({ user_id: user.id, instant_sl_tp_modify: instant }, { onConflict: "user_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, instant });
}
