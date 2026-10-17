import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AUTONOMY_MAX_LOT_CEILING,
  AUTONOMY_MAX_RISK_PCT_CEILING,
  AUTONOMY_MAX_TRADES_CEILING,
  DEFAULT_AUTONOMY,
  allAcked,
  isAutonomyLevel,
  normalizeLimit,
  resolveAutonomy,
  type AutonomyAcks,
} from "@/lib/trading/autonomy";
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
    autonomy: DEFAULT_AUTONOMY,
    autonomyResolved: resolveAutonomy(DEFAULT_AUTONOMY),
  };
  if (!supabase) return Response.json(empty);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json(empty);

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select(
      "default_trade_volume,alert_auto_trade_enabled,alert_sl_offset,alert_tp_offset,autonomy_level,autonomy_max_lot,autonomy_max_risk_pct,autonomy_max_trades_per_day,autonomy_ack_unattended,autonomy_ack_limits,autonomy_ack_loss,autonomy_granted_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const rawLevel = Number(data?.autonomy_level);
  const autonomy = {
    level: isAutonomyLevel(rawLevel) ? rawLevel : DEFAULT_AUTONOMY.level,
    maxLot: normalizeLimit(data?.autonomy_max_lot, AUTONOMY_MAX_LOT_CEILING),
    maxRiskPct: normalizeLimit(data?.autonomy_max_risk_pct, AUTONOMY_MAX_RISK_PCT_CEILING),
    maxTradesPerDay: normalizeLimit(data?.autonomy_max_trades_per_day, AUTONOMY_MAX_TRADES_CEILING),
    acks: {
      unattended: Boolean(data?.autonomy_ack_unattended),
      limits: Boolean(data?.autonomy_ack_limits),
      loss: Boolean(data?.autonomy_ack_loss),
    },
    grantedAt: (data?.autonomy_granted_at as string | null) ?? null,
  };

  return Response.json({
    defaultVolume: normalizeTradeVolume(data?.default_trade_volume ?? DEFAULT_TRADE_VOLUME_LOTS),
    alertAutoTradeEnabled: Boolean(data?.alert_auto_trade_enabled),
    alertSlOffset: parseOffset(data?.alert_sl_offset),
    alertTpOffset: parseOffset(data?.alert_tp_offset),
    autonomy,
    // What actually applies, so the panel and the feed say the same thing
    // about a level 3 that is still missing a number or a tick.
    autonomyResolved: resolveAutonomy(autonomy),
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
    autonomyLevel?: number;
    autonomyMaxLot?: number | null;
    autonomyMaxRiskPct?: number | null;
    autonomyMaxTradesPerDay?: number | null;
    autonomyAcks?: Partial<AutonomyAcks>;
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

  if (alertAutoTradeEnabled) {
    const { data: pref } = await supabase
      .from("user_workspace_preferences")
      .select("live_trading_enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pref?.live_trading_enabled) {
      return Response.json(
        { error: "Enable Live trading first (3-step risk confirmation) before auto-trade on alerts." },
        { status: 403 },
      );
    }
  }

  /* ── autonomy ──────────────────────────────────────────────────────────
     Only written when the caller sent it, so the existing volume/offset saves
     from the same panel cannot silently reset somebody's level to the
     default. A partial POST must not be a downgrade. */
  const wantsAutonomy =
    body.autonomyLevel !== undefined ||
    body.autonomyMaxLot !== undefined ||
    body.autonomyMaxRiskPct !== undefined ||
    body.autonomyMaxTradesPerDay !== undefined ||
    body.autonomyAcks !== undefined;

  const row: Record<string, unknown> = {
    user_id: user.id,
    default_trade_volume: defaultVolume,
    alert_auto_trade_enabled: alertAutoTradeEnabled,
    alert_sl_offset: alertSlOffset,
    alert_tp_offset: alertTpOffset,
  };

  let autonomy = DEFAULT_AUTONOMY;
  if (wantsAutonomy) {
    const level = isAutonomyLevel(body.autonomyLevel) ? body.autonomyLevel : DEFAULT_AUTONOMY.level;
    const acks: AutonomyAcks = {
      unattended: Boolean(body.autonomyAcks?.unattended),
      limits: Boolean(body.autonomyAcks?.limits),
      loss: Boolean(body.autonomyAcks?.loss),
    };
    autonomy = {
      level,
      maxLot: normalizeLimit(body.autonomyMaxLot, AUTONOMY_MAX_LOT_CEILING),
      maxRiskPct: normalizeLimit(body.autonomyMaxRiskPct, AUTONOMY_MAX_RISK_PCT_CEILING),
      maxTradesPerDay: normalizeLimit(body.autonomyMaxTradesPerDay, AUTONOMY_MAX_TRADES_CEILING),
      acks,
      // Stamped server-side. A client-sent timestamp on a consent record is
      // not evidence of anything.
      grantedAt: allAcked(acks) ? new Date().toISOString() : null,
    };
    row.autonomy_level = autonomy.level;
    row.autonomy_max_lot = autonomy.maxLot;
    row.autonomy_max_risk_pct = autonomy.maxRiskPct;
    row.autonomy_max_trades_per_day = autonomy.maxTradesPerDay;
    row.autonomy_ack_unattended = acks.unattended;
    row.autonomy_ack_limits = acks.limits;
    row.autonomy_ack_loss = acks.loss;
    row.autonomy_granted_at = autonomy.grantedAt;
  }

  const { error } = await supabase
    .from("user_workspace_preferences")
    .upsert(row, { onConflict: "user_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    ok: true,
    defaultVolume,
    alertAutoTradeEnabled,
    alertSlOffset,
    alertTpOffset,
    ...(wantsAutonomy
      ? { autonomy, autonomyResolved: resolveAutonomy(autonomy) }
      : {}),
    minVolume: MIN_TRADE_VOLUME_LOTS,
    maxVolume: MAX_TRADE_VOLUME_LOTS,
  });
}
