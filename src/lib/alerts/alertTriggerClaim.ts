import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Atomically claim one firing of a price alert.
 *
 * The trigger route used to read `triggered_at`, check the cooldown in JS and
 * then write. Two requests landing together (two open tabs, phone + desktop,
 * or a retried fetch) both saw the old `triggered_at`, both passed, and both
 * went on to `maybeAutoTradeOnAlert` — two market orders on a funded account
 * for one crossing. The cooldown check now lives in the UPDATE's WHERE
 * clause, so Postgres lets exactly one of them win; the loser gets zero rows
 * back and must skip push, feed and auto-trade.
 */
export function triggerCooldownCutoff(nowMs: number, cooldownSeconds: number): string {
  return new Date(nowMs - cooldownSeconds * 1000).toISOString();
}

export async function claimAlertTrigger(
  supabase: SupabaseClient,
  args: {
    alertId: string;
    userId: string;
    nowIso: string;
    cooldownSeconds: number;
    metadata: Record<string, unknown>;
  },
): Promise<{ claimed: true } | { claimed: false; error?: string }> {
  const cutoff = triggerCooldownCutoff(Date.parse(args.nowIso), args.cooldownSeconds);
  const { data, error } = await supabase
    .from("user_alerts")
    .update({ triggered_at: args.nowIso, metadata: args.metadata })
    .eq("id", args.alertId)
    .eq("user_id", args.userId)
    .eq("status", "active")
    .or(`triggered_at.is.null,triggered_at.lt.${cutoff}`)
    .select("id");

  if (error) return { claimed: false, error: error.message };
  return Array.isArray(data) && data.length > 0 ? { claimed: true } : { claimed: false };
}
