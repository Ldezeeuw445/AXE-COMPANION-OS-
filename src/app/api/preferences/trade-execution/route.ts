import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_TRADE_VOLUME_LOTS,
  MAX_TRADE_VOLUME_LOTS,
  MIN_TRADE_VOLUME_LOTS,
  normalizeTradeVolume,
} from "@/lib/trading/tradeVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOffset(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const empty = {
    defaultVolume: DEFAULT_TRADE_VOLUME_LOTS,
    alertAutoTradeEnabled: false,
    alertSlOffset: null,
    alertTpOffset: null,
  };
  if (!supabase) return Response.json(empty);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json(empty);

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("default_trade_volume,alert_auto_trade_enabled,alert_sl_offset,alert_tp_offset")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({
    defaultVolume: normalizeTradeVolume(data?.default_trade_volume ?? DEFAULT_TRADE_VOLUME_LOTS),
    alertAutoTradeEnabled: Boolean(data?.alert_auto_trade_enabled),
    alertSlOffset: parseOffset(data?.alert_sl_offset),
    alertTpOffset: parseOffset(data?.alert_tp_offset),
  });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    defaultVolume?: number;
    alertAutoTradeEnabled?: boolean;
    alertSlOffset?: number | null;
    alertTpOffset?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const defaultVolume = normalizeTradeVolume(body.defaultVolume ?? DEFAULT_TRADE_VOLUME_LOTS);
  const alertAutoTradeEnabled = Boolean(body.alertAutoTradeEnabled);
  const alertSlOffset = parseOffset(body.alertSlOffset);
  const alertTpOffset = parseOffset(body.alertTpOffset);

  if (alertAutoTradeEnabled && (alertSlOffset == null || alertTpOffset == null)) {
    return Response.json(
      { error: "Set default SL and TP distance before enabling alert auto-trade." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("user_workspace_preferences").upsert(
    {
      user_id: user.id,
      default_trade_volume: defaultVolume,
      alert_auto_trade_enabled: alertAutoTradeEnabled,
      alert_sl_offset: alertSlOffset,
      alert_tp_offset: alertTpOffset,
    },
    { onConflict: "user_id" },
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    defaultVolume,
    alertAutoTradeEnabled,
    alertSlOffset,
    alertTpOffset,
    minVolume: MIN_TRADE_VOLUME_LOTS,
    maxVolume: MAX_TRADE_VOLUME_LOTS,
  });
}
