import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server-side persistence for the long-term "live trading enabled" flag.
 *
 * Lives on the user's workspace preferences row alongside `active_account_id`
 * etc. The 30-minute arming window and the per-order confirm modal stay
 * client-side — losing those on reinstall is by design (re-arm = re-think).
 *
 * Loader returns `false` for unauthenticated requests so callers can render
 * the disclaimer state without a separate auth branch.
 */

export type LiveTradingServerState = {
  enabled: boolean;
  enabledAtIso: string | null;
};

export async function getLiveTradingServerState(): Promise<LiveTradingServerState> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { enabled: false, enabledAtIso: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { enabled: false, enabledAtIso: null };

  const { data } = await supabase
    .from("user_workspace_preferences")
    .select("live_trading_enabled, live_trading_enabled_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    enabled: Boolean(data?.live_trading_enabled),
    enabledAtIso: (data?.live_trading_enabled_at as string | null) ?? null,
  };
}
