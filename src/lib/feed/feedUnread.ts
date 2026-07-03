import type { AxeFeedItem } from "@/types/feed";
import {
  type FeedTabId,
  feedItemTab,
  getFeedTabDef,
  itemBelongsToFeedTab,
} from "@/lib/feed/feedTabs";
import { getFeedTabLastSeenAt } from "@/lib/feed/feedSeen";

function countUnreadSince(items: AxeFeedItem[], lastSeenAt: string | null): number {
  const cutoff = lastSeenAt
    ? new Date(lastSeenAt).getTime()
    : Date.now() - 24 * 60 * 60 * 1000;
  if (Number.isNaN(cutoff)) return 0;
  return items.filter((i) => new Date(i.createdAt).getTime() > cutoff).length;
}

export function countUnreadFeedItems(items: AxeFeedItem[], lastSeenAt: string | null): number {
  return countUnreadSince(items, lastSeenAt);
}

export function countUnreadFeedItemsForTab(
  items: AxeFeedItem[],
  tab: FeedTabId,
  lastSeenAt?: string | null,
): number {
  const seen = lastSeenAt ?? getFeedTabLastSeenAt(tab);
  const tabItems = items.filter((item) => itemBelongsToFeedTab(item, tab));
  return countUnreadSince(tabItems, seen);
}

export type FeedUnreadSummary = {
  total: number;
  byTab: Record<FeedTabId, number>;
  /** Tab with the newest unread item — drives nav badge color */
  primaryTab: FeedTabId | null;
};

export function summarizeFeedUnread(items: AxeFeedItem[]): FeedUnreadSummary {
  const byTab: Record<FeedTabId, number> = {
    morning_brief: countUnreadFeedItemsForTab(items, "morning_brief"),
    daily_news: countUnreadFeedItemsForTab(items, "daily_news"),
    market_recap: countUnreadFeedItemsForTab(items, "market_recap"),
  };
  const total = byTab.morning_brief + byTab.daily_news + byTab.market_recap;

  const lastSeen = {
    morning_brief: getFeedTabLastSeenAt("morning_brief"),
    daily_news: getFeedTabLastSeenAt("daily_news"),
    market_recap: getFeedTabLastSeenAt("market_recap"),
  };

  let primaryTab: FeedTabId | null = null;
  let newestUnread = 0;
  for (const item of items) {
    const tab = feedItemTab(item);
    const cutoff = lastSeen[tab]
      ? new Date(lastSeen[tab]!).getTime()
      : Date.now() - 24 * 60 * 60 * 1000;
    const t = new Date(item.createdAt).getTime();
    if (!Number.isNaN(t) && t > cutoff && t > newestUnread) {
      newestUnread = t;
      primaryTab = tab;
    }
  }

  return { total, byTab, primaryTab };
}

export function feedUnreadBadgeClass(primaryTab: FeedTabId | null): string {
  if (!primaryTab) return "bg-cyan-400";
  return getFeedTabDef(primaryTab).badgeBg;
}
