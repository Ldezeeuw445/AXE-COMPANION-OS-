import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAlertAutoTradeArmed } from "@/lib/trading/alertAutoTradeArmed";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("alert_auto_trade_armed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const armedAt = (data?.alert_auto_trade_armed_at as string | null) ?? null;
  return NextResponse.json({
    armed: isAlertAutoTradeArmed(armedAt),
    armedAt,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { arm?: boolean };
  try {
    body = (await req.json()) as { arm?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const armedAt = body.arm ? new Date().toISOString() : null;

  const { error } = await supabase.from("user_workspace_preferences").upsert(
    {
      user_id: user.id,
      alert_auto_trade_armed_at: armedAt,
    },
    { onConflict: "user_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    armed: isAlertAutoTradeArmed(armedAt),
    armedAt,
  });
}
