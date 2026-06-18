import type { SupabaseClient } from "@supabase/supabase-js";

/** Insert a feed timeline row (idempotent on event_key). */
export async function recordProactiveFeedEvent(
  supabase: SupabaseClient,
  userId: string,
  eventKey: string,
  title: string,
  body: string,
  url: string,
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
  return true;
}
