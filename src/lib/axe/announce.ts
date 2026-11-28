import type { SupabaseClient } from "@supabase/supabase-js";
import { type PushCategory } from "@/lib/push/categories";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import type { PushSender } from "@/lib/push/deliver";
import { normalizeEventKey } from "@/lib/push/dedup";
import { renderNoticeBody, type ProactiveNotice } from "@/lib/axe/notice";

export type AnnounceOptions = {
  eventKey: string;
  notice: ProactiveNotice;
  category: PushCategory;
  hasPush: boolean;
  extra?: { symbol?: string; timeframe?: string; threadId?: string };
  /** Test seam, handed straight to `dispatchPushEvent`. Omit in production. */
  send?: PushSender;
  now?: Date;
};

/**
 * Record one notice, and push it if the trader has push on.
 *
 * Both used to be done by hand at each of the watcher's producers, with the
 * title, body and URL repeated three times per notice and the push arguments
 * drifting from the feed row's. Worse, every producer decided for itself
 * whether to say anything beyond what had happened — and most did not. The
 * notice type will not let a producer skip the next step now, and this is the
 * only place that writes one.
 *
 * Lives outside `axeProactiveWatcher.ts` so the C6 delivery test can drive the
 * watcher's own hop (feed row, then push) without loading the whole watcher.
 */
export async function announce(
  supabase: SupabaseClient,
  userId: string,
  opts: AnnounceOptions,
): Promise<{ created: number; pushed: number }> {
  const body = renderNoticeBody(opts.notice);
  const { error } = await supabase.from("axe_proactive_events").insert({
    user_id: userId,
    event_key: opts.eventKey,
    title: opts.notice.title,
    body,
    url: opts.notice.action.href,
  });
  if (error && error.code !== "23505") throw error;
  const created = error ? 0 : 1;

  if (!opts.hasPush) return { created, pushed: 0 };

  if (!created) {
    // A feed row proves the notice was recorded, not that any device received
    // it. Failed delivery releases its claim, so the next watcher run may retry.
    // Keep a successful (or still in-flight) claim once per event, even after
    // the category cooldown; a continuing condition is not a new notice.
    // MT5 sync records the same feed events via recordProactiveFeedEvent,
    // whose push claims carry a `feed:` prefix. Both count as already sent.
    const { data: deliveries, error: deliveryError } = await supabase
      .from("push_event_deliveries")
      .select("event_key")
      .eq("user_id", userId)
      .in("event_key", [normalizeEventKey(opts.eventKey), normalizeEventKey(`feed:${opts.eventKey}`)]);
    // Only retry when absence is confirmed. An unavailable delivery ledger
    // must not turn every existing feed row into a repeated notification.
    if (deliveryError || !deliveries || deliveries.length > 0) return { created, pushed: 0 };
  }

  const result = await dispatchPushEvent({
    userId,
    category: opts.category,
    // Share the MT5 feed producer's claim, including when both producers race
    // between inserting the feed row and claiming push delivery.
    eventKey: `feed:${opts.eventKey}`,
    title: `AXE · ${opts.notice.title}`,
    body,
    url: opts.notice.action.href,
    symbol: opts.extra?.symbol,
    timeframe: opts.extra?.timeframe,
    threadId: opts.extra?.threadId,
    supabase,
    send: opts.send,
    now: opts.now,
  });

  return { created, pushed: result.ok && result.sent > 0 ? 1 : 0 };
}
