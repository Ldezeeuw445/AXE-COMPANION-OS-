import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_TRADE_VOLUME_LOTS,
  MAX_TRADE_VOLUME_LOTS,
  MIN_TRADE_VOLUME_LOTS,
  normalizeTradeVolume,
} from "@/lib/trading/tradeVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return Response.json({
      defaultVolume: DEFAULT_TRADE_VOLUME_LOTS,
      alertAutoTradeEnabled: false,
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({
      defaultVolume: DEFAULT_TRADE_VOLUME_LOTS,
      alertAutoTradeEnabled: false,
    });
  }

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("default_trade_volume,alert_auto_trade_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({
    defaultVolume: normalizeTradeVolume(data?.default_trade_volume ?? DEFAULT_TRADE_VOLUME_LOTS),
    alertAutoTradeEnabled: Boolean(data?.alert_auto_trade_enabled),
  });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { defaultVolume?: number; alertAutoTradeEnabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const defaultVolume = normalizeTradeVolume(body.defaultVolume ?? DEFAULT_TRADE_VOLUME_LOTS);
  const alertAutoTradeEnabled = Boolean(body.alertAutoTradeEnabled);

  const { error } = await supabase.from("user_workspace_preferences").upsert(
    {
      user_id: user.id,
      default_trade_volume: defaultVolume,
      alert_auto_trade_enabled: alertAutoTradeEnabled,
    },
    { onConflict: "user_id" },
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    defaultVolume,
    alertAutoTradeEnabled,
    minVolume: MIN_TRADE_VOLUME_LOTS,
    maxVolume: MAX_TRADE_VOLUME_LOTS,
  });
}
