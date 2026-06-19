import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_TRADE_VOLUME_LOTS, normalizeTradeVolume } from "@/lib/trading/tradeVolume";
import type { TradeExecutionPrefs } from "@/lib/trading/tradeExecutionPrefs";

export type { TradeExecutionPrefs };

export async function getTradeExecutionPrefsForUser(userId: string): Promise<TradeExecutionPrefs> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { defaultVolume: DEFAULT_TRADE_VOLUME_LOTS, alertAutoTradeEnabled: false };
  }

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("default_trade_volume,alert_auto_trade_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    defaultVolume: normalizeTradeVolume(data?.default_trade_volume ?? DEFAULT_TRADE_VOLUME_LOTS),
    alertAutoTradeEnabled: Boolean(data?.alert_auto_trade_enabled),
  };
}

export async function getTradeExecutionPrefsServerState(): Promise<TradeExecutionPrefs> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { defaultVolume: DEFAULT_TRADE_VOLUME_LOTS, alertAutoTradeEnabled: false };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { defaultVolume: DEFAULT_TRADE_VOLUME_LOTS, alertAutoTradeEnabled: false };
  }

  return getTradeExecutionPrefsForUser(user.id);
}
