import type { SupabaseClient } from "@supabase/supabase-js";
import { type PushCategory } from "@/lib/push/categories";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import type { PushSender } from "@/lib/push/deliver";
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
  if (error) {
    // Duplicate event key: already said, and saying it twice is how a useful
    // notice becomes one the trader swipes away without reading.
    if (error.code === "23505") return { created: 0, pushed: 0 };
    throw error;
  }

  if (!opts.hasPush) return { created: 1, pushed: 0 };

  const result = await dispatchPushEvent({
    userId,
    category: opts.category,
    eventKey: opts.eventKey,
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

  return { created: 1, pushed: result.ok && result.sent > 0 ? 1 : 0 };
}
