import type { SupabaseClient } from "@supabase/supabase-js";
import { internalPushHeaders } from "@/lib/push/internalPushAuth";

async function fireFeedPush(
  userId: string,
  title: string,
  body: string,
  url: string,
): Promise<void> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!baseUrl) return;

    await fetch(`${baseUrl}/api/push/send`, {
      method: "POST",
      headers: internalPushHeaders(),
      body: JSON.stringify({
        userId,
        title: `AXE · ${title}`,
        body: body.length > 180 ? `${body.slice(0, 177)}…` : body,
        url,
        tag: `feed-${Date.now()}`,
      }),
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
    void fireFeedPush(userId, title, body, url);
  }

  return true;
}
