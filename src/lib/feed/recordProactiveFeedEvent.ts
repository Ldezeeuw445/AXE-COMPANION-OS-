import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchPushEvent } from "@/lib/push/dispatch";
import { type PushCategory } from "@/lib/push/categories";

/** The push half of this helper. Injectable so a test can observe the ordering. */
export type FeedPushDispatcher = (input: {
  userId: string;
  category: PushCategory;
  eventKey: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}) => Promise<unknown>;

async function fireFeedPush(
  userId: string,
  title: string,
  body: string,
  url: string,
  eventKey: string,
  category: PushCategory = "axe_finding",
  dispatch: FeedPushDispatcher = dispatchPushEvent,
): Promise<void> {
  try {
    await dispatch({
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
  opts?: { push?: boolean; category?: PushCategory; dispatch?: FeedPushDispatcher },
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
    // Awaited, not fired and forgotten. These producers run inside server
    // actions and cron routes; once the handler returns, the runtime is free to
    // freeze or drop whatever is still pending. A dropped `fireFeedPush` is
    // invisible — the feed row is already written, so the alert shows up in the
    // app and simply never reaches the phone. `fireFeedPush` swallows its own
    // errors, so awaiting it cannot fail the write that already succeeded.
    await fireFeedPush(
      userId,
      title,
      body,
      url,
      eventKey,
      opts?.category ?? "axe_finding",
      opts?.dispatch,
    );
  }

  return true;
}
