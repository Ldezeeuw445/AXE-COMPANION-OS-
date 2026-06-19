import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAlertAutoTradeArmed } from "@/lib/trading/alertAutoTradeArmed";
import { DEFAULT_TRADE_VOLUME_LOTS, normalizeTradeVolume } from "@/lib/trading/tradeVolume";
import type { TradeExecutionPrefs } from "@/lib/trading/tradeExecutionPrefs";

export type { TradeExecutionPrefs };

function parseOffset(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapPrefsRow(data: Record<string, unknown> | null | undefined): TradeExecutionPrefs {
  const armedAt = (data?.alert_auto_trade_armed_at as string | null) ?? null;
  return {
    defaultVolume: normalizeTradeVolume(data?.default_trade_volume ?? DEFAULT_TRADE_VOLUME_LOTS),
    alertAutoTradeEnabled: Boolean(data?.alert_auto_trade_enabled),
    alertAutoTradeArmed: isAlertAutoTradeArmed(armedAt),
    alertAutoTradeArmedAt: armedAt,
    alertSlOffset: parseOffset(data?.alert_sl_offset),
    alertTpOffset: parseOffset(data?.alert_tp_offset),
  };
}

const EMPTY_PREFS: TradeExecutionPrefs = {
  defaultVolume: DEFAULT_TRADE_VOLUME_LOTS,
  alertAutoTradeEnabled: false,
  alertAutoTradeArmed: false,
  alertAutoTradeArmedAt: null,
  alertSlOffset: null,
  alertTpOffset: null,
};

export async function getTradeExecutionPrefsForUser(userId: string): Promise<TradeExecutionPrefs> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return EMPTY_PREFS;

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select(
      "default_trade_volume,alert_auto_trade_enabled,alert_auto_trade_armed_at,alert_sl_offset,alert_tp_offset",
    )
    .eq("user_id", userId)
    .maybeSingle();

  return mapPrefsRow(data ?? undefined);
}

export async function getTradeExecutionPrefsServerState(): Promise<TradeExecutionPrefs> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return EMPTY_PREFS;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_PREFS;

  return getTradeExecutionPrefsForUser(user.id);
}
