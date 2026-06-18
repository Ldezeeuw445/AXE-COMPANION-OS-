import type { AxeFeedItem } from "@/types/feed";

export function countUnreadFeedItems(items: AxeFeedItem[], lastSeenAt: string | null): number {
  const cutoff = lastSeenAt
    ? new Date(lastSeenAt).getTime()
    : Date.now() - 24 * 60 * 60 * 1000;
  if (Number.isNaN(cutoff)) return 0;
  return items.filter((i) => new Date(i.createdAt).getTime() > cutoff).length;
}
