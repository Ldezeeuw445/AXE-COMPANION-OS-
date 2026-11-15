import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Atomically claim one firing of a price alert, and (for auto-trade) pause
 * the alert after its single trade.
 *
 * The trigger route used to read `triggered_at`, check the cooldown in JS and
 * then write. Two requests landing together (two open tabs, phone + desktop,
 * or a retried fetch) both saw the old `triggered_at`, both passed, and both
 * went on to `maybeAutoTradeOnAlert` — two market orders on a funded account
 * for one crossing. The cooldown check now lives in the UPDATE's WHERE
 * clause, so Postgres lets exactly one of them win; the loser gets zero rows
 * back and must skip push, feed and auto-trade.
 *
 * Auto-trade alerts are one-shot: after that winning request actually places
 * a trade, `pauseAlertAfterAutoTrade` sets the row to `paused` with the same
 * id + user + status=active claim, so it cannot fire a second market order.
 * The trader can still see it and re-enable it. A second pause is a no-op,
 * so a retried cleanup cannot affect another user's alert. Notification-only
 * alerts, and auto-trade attempts that did not place an order, stay active.
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

/**
 * Pause the alert after one successful auto-trade. Same atomic claim as the
 * trigger: scoped to the owning user and only applied while the row is still
 * `active`, so a concurrent request cannot pause someone else's alert or
 * re-write a row the trader already changed. Zero rows means it was already
 * paused (race-safe, idempotent).
 */
export async function pauseAlertAfterAutoTrade(
  supabase: SupabaseClient,
  args: { alertId: string; userId: string },
): Promise<{ paused: true } | { paused: false; error?: string }> {
  const { data, error } = await supabase
    .from("user_alerts")
    .update({ status: "paused" })
    .eq("id", args.alertId)
    .eq("user_id", args.userId)
    .eq("status", "active")
    .select("id");

  if (error) return { paused: false, error: error.message };
  return Array.isArray(data) && data.length > 0 ? { paused: true } : { paused: false };
}
