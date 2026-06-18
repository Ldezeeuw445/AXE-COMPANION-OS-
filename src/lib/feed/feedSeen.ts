export const AXE_FEED_LAST_SEEN_KEY = "axe.feed.lastSeenAt";

export function getFeedLastSeenAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(AXE_FEED_LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

/** Mark the feed as read up to `at` (defaults to now). Dispatches axe:feed-seen. */
export function markFeedAsSeen(at?: string): void {
  if (typeof window === "undefined") return;
  const stamp = at ?? new Date().toISOString();
  try {
    localStorage.setItem(AXE_FEED_LAST_SEEN_KEY, stamp);
    window.dispatchEvent(new CustomEvent("axe:feed-seen"));
  } catch {
    /* ignore */
  }
}

/** Mark all current feed items read — uses newest item time so nothing stays unread. */
export function markAllFeedItemsRead(
  items: { createdAt: string }[],
  opts?: { at?: string },
): void {
  const now = Date.now();
  const newest = items.reduce((max, item) => {
    const t = new Date(item.createdAt).getTime();
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, now);
  const at = opts?.at ?? new Date(Math.max(newest, now)).toISOString();
  markFeedAsSeen(at);
}
