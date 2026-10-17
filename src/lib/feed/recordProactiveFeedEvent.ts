import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import { type PushCategory } from "@/lib/push/categories";

async function fireFeedPush(
  userId: string,
  title: string,
  body: string,
  url: string,
  eventKey: string,
  category: PushCategory = "axe_finding",
): Promise<void> {
  try {
    await dispatchPushEvent({
      userId,
      category,
      eventKey: `feed:${eventKey}`,
      title: `AXE · ${title}`,
      body,
      url,
      tag: `feed-${eventKey}`,
    });
  } catch {
    /* best-effort */
  }
}

/** Insert a feed timeline row (idempotent on event_key) and best-effort push. */
export async function recordProactiveFeedEvent(
  supabase: SupabaseClient,
  userId: string,
  eventKey: string,
  title: string,
  body: string,
  url: string,
  opts?: { push?: boolean; category?: PushCategory },
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
    void fireFeedPush(userId, title, body, url, eventKey, opts?.category ?? "axe_finding");
  }

  return true;
}
