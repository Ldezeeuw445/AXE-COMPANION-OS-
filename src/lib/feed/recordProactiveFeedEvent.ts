import type { SupabaseClient } from "@supabase/supabase-js";
import { internalPushHeaders } from "@/lib/push/internalPushAuth";
import {
  buildFeedPushRequest,
  deliverFeedPush,
  resolveFeedPushBaseUrl,
} from "@/lib/feed/feedEventPush";

/** Insert a feed timeline row (idempotent on event_key) and best-effort push. */
export async function recordProactiveFeedEvent(
  supabase: SupabaseClient,
  userId: string,
  eventKey: string,
  title: string,
  body: string,
  url: string,
  opts?: { push?: boolean },
): Promise<boolean> {
  const { error } = await supabase.from("axe_proactive_events").insert({
    user_id: userId,
    event_key: eventKey,
    title,
    body,
    url,
  });
  if (error) {
    if (error.code === "23505") return false;
    console.error("[recordProactiveFeedEvent]", error.message);
    return false;
  }

  if (opts?.push !== false) {
    // Awaited, not `void`: a detached fetch can be dropped once a serverless
    // handler returns (C6). deliverFeedPush is timeout-bounded and never throws.
    await deliverFeedPush({
      baseUrl: resolveFeedPushBaseUrl(process.env),
      headers: internalPushHeaders(),
      request: buildFeedPushRequest(userId, title, body, url),
    });
  }

  return true;
}
