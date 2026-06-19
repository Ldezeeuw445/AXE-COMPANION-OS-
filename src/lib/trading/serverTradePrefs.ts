import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_TRADE_VOLUME_LOTS, normalizeTradeVolume } from "@/lib/trading/tradeVolume";
import type { TradeExecutionPrefs } from "@/lib/trading/tradeExecutionPrefs";

export type { TradeExecutionPrefs };

function parseOffset(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getTradeExecutionPrefsForUser(userId: string): Promise<TradeExecutionPrefs> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      defaultVolume: DEFAULT_TRADE_VOLUME_LOTS,
      alertAutoTradeEnabled: false,
      alertSlOffset: null,
      alertTpOffset: null,
    };
  }

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("default_trade_volume,alert_auto_trade_enabled,alert_sl_offset,alert_tp_offset")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    defaultVolume: normalizeTradeVolume(data?.default_trade_volume ?? DEFAULT_TRADE_VOLUME_LOTS),
    alertAutoTradeEnabled: Boolean(data?.alert_auto_trade_enabled),
    alertSlOffset: parseOffset(data?.alert_sl_offset),
    alertTpOffset: parseOffset(data?.alert_tp_offset),
  };
}

export async function getTradeExecutionPrefsServerState(): Promise<TradeExecutionPrefs> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      defaultVolume: DEFAULT_TRADE_VOLUME_LOTS,
      alertAutoTradeEnabled: false,
      alertSlOffset: null,
      alertTpOffset: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      defaultVolume: DEFAULT_TRADE_VOLUME_LOTS,
      alertAutoTradeEnabled: false,
      alertSlOffset: null,
      alertTpOffset: null,
    };
  }

  return getTradeExecutionPrefsForUser(user.id);
}
