import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluatePriceAlertsForUser } from "@/lib/alerts/priceAlertCronEvaluator";
import { recordProactiveFeedEvent } from "@/lib/feed/recordProactiveFeedEvent";
import { dispatchPushEvent } from "@/lib/push/dispatch";

/**
 * Watcher entry point: evaluate `user_alerts` price rows (any source) and
 * deliver via the same claim + feed + `price_alert` push path as the in-app
 * trigger route. Auto-trade is intentionally omitted — TOS rows do not set
 * Companion's `auto_trade_enabled`, which defaults to true on the trigger route.
 */
export async function evaluatePriceAlertsForUserWithPush(
  supabase: SupabaseClient,
  userId: string,
  opts?: { accountId?: string | null; hasPush?: boolean },
): Promise<{ triggered: number; pushed: number; baselined: number }> {
  return evaluatePriceAlertsForUser(supabase, userId, {
    hasPush: opts?.hasPush,
    accountId: opts?.accountId ?? null,
    recordFeed: (sb, uid, eventKey, title, body, url) =>
      recordProactiveFeedEvent(sb, uid, eventKey, title, body, url, { push: false }),
    firePush: async (input) => {
      const result = await dispatchPushEvent({
        userId: input.userId,
        category: "price_alert",
        eventKey: input.eventKey,
        title: input.title,
        body: input.body,
        url: input.url,
        symbol: input.symbol ?? undefined,
        tag: `alert-${input.eventKey}`,
      });
      return result.ok && result.sent > 0;
    },
  });
}
