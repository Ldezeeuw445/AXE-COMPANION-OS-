import type { AxeFeedItem } from "@/types/feed";
import {
  type FeedTabId,
  feedItemTab,
  itemBelongsToFeedTab,
} from "@/lib/feed/feedTabs";

export const AXE_FEED_LAST_SEEN_KEY = "axe.feed.lastSeenAt";

const TAB_SEEN_KEYS: Record<FeedTabId, string> = {
  morning_brief: "axe.feed.lastSeenAt.morning_brief",
  daily_news: "axe.feed.lastSeenAt.daily_news",
  market_recap: "axe.feed.lastSeenAt.market_recap",
};

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Legacy global last-seen — kept for backward compatibility. */
export function getFeedLastSeenAt(): string | null {
  return readStorage(AXE_FEED_LAST_SEEN_KEY);
}

export function getFeedTabLastSeenAt(tab: FeedTabId): string | null {
  const tabKey = readStorage(TAB_SEEN_KEYS[tab]);
  if (tabKey) return tabKey;
  return getFeedLastSeenAt();
}

export function getAllFeedTabLastSeen(): Record<FeedTabId, string | null> {
  return {
    morning_brief: getFeedTabLastSeenAt("morning_brief"),
    daily_news: getFeedTabLastSeenAt("daily_news"),
    market_recap: getFeedTabLastSeenAt("market_recap"),
  };
}

/** Mark the feed as read up to `at` (defaults to now). Dispatches axe:feed-seen. */
export function markFeedAsSeen(at?: string): void {
  const stamp = at ?? new Date().toISOString();
  writeStorage(AXE_FEED_LAST_SEEN_KEY, stamp);
  for (const key of Object.values(TAB_SEEN_KEYS)) {
    writeStorage(key, stamp);
  }
  window.dispatchEvent(new CustomEvent("axe:feed-seen"));
}

export function markFeedTabAsSeen(tab: FeedTabId, at?: string): void {
  if (typeof window === "undefined") return;
  const stamp = at ?? new Date().toISOString();
  writeStorage(TAB_SEEN_KEYS[tab], stamp);
  window.dispatchEvent(new CustomEvent("axe:feed-seen"));
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

export function markFeedTabItemsRead(tab: FeedTabId, items: AxeFeedItem[]): void {
  const tabItems = items.filter((item) => itemBelongsToFeedTab(item, tab));
  if (tabItems.length === 0) {
    markFeedTabAsSeen(tab);
    return;
  }
  const now = Date.now();
  const newest = tabItems.reduce((max, item) => {
    const t = new Date(item.createdAt).getTime();
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, now);
  markFeedTabAsSeen(tab, new Date(Math.max(newest, now)).toISOString());
}

export function markAllFeedTabsRead(items: AxeFeedItem[]): void {
  for (const tab of Object.keys(TAB_SEEN_KEYS) as FeedTabId[]) {
    markFeedTabItemsRead(tab, items);
  }
  markFeedAsSeen();
}

export { feedItemTab, itemBelongsToFeedTab };
