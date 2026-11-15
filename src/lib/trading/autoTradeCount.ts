import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-account count of trades AXE placed on its own today.
 *
 * The daily cap used to count `alert_trade:%` feed rows per *user*, so a
 * trader with a funded and a personal account shared one limit: three
 * trades on the personal account used up the cap for the funded one.
 * (`axe_proactive_events` has no account column and a schema change needs
 * the owner's sign-off, so the account id is carried in the event key.)
 *
 * New key:    alert_trade:acct-<accountId>:<alertId>:<ts>
 * Legacy key: alert_trade:<alertId>:<ts>   (written before this change)
 *
 * Legacy rows cannot be attributed to an account. They are counted against
 * EVERY account until their broker day has passed — the conservative
 * choice, so the migration never loosens the cap.
 */
export const AUTO_TRADE_KEY_PREFIX = "alert_trade:";
const ACCOUNT_TAG = "acct-";

export function autoTradeEventKey(accountId: string, alertId: string, ts: number): string {
  return `${AUTO_TRADE_KEY_PREFIX}${ACCOUNT_TAG}${accountId}:${alertId}:${ts}`;
}

export function autoTradeAccountLikePattern(accountId: string): string {
  return `${AUTO_TRADE_KEY_PREFIX}${ACCOUNT_TAG}${accountId}:%`;
}

export async function countAutoTradesToday(
  supabase: SupabaseClient,
  args: { userId: string; accountId: string; sinceIso: string },
): Promise<{ count: number } | { error: string }> {
  const [mine, legacy] = await Promise.all([
    supabase
      .from("axe_proactive_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .like("event_key", autoTradeAccountLikePattern(args.accountId))
      .gte("created_at", args.sinceIso),
    supabase
      .from("axe_proactive_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .like("event_key", `${AUTO_TRADE_KEY_PREFIX}%`)
      .not("event_key", "like", `${AUTO_TRADE_KEY_PREFIX}${ACCOUNT_TAG}%`)
      .gte("created_at", args.sinceIso),
  ]);
  if (mine.error) return { error: mine.error.message };
  if (legacy.error) return { error: legacy.error.message };
  return { count: (mine.count ?? 0) + (legacy.count ?? 0) };
}
