"use client";

/**
 * Compact gold / blue / green unread dots for the three AXE feed lanes.
 * Shown in the left drawer before the PRO pill on the Feed row.
 */

import { useEffect, useState } from "react";
import { FEED_TABS, type FeedTabId } from "@/lib/feed/feedTabs";
import { summarizeFeedUnread } from "@/lib/feed/feedUnread";
import type { AxeFeedItem } from "@/types/feed";

type Counts = Record<FeedTabId, number>;

const EMPTY: Counts = { morning_brief: 0, daily_news: 0, market_recap: 0 };

export function FeedLaneBadges() {
  const [byTab, setByTab] = useState<Counts>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    let cachedItems: AxeFeedItem[] = [];

    async function refresh() {
      try {
        const res = await fetch("/api/feed", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: AxeFeedItem[] };
        cachedItems = json.items ?? [];
        const summary = summarizeFeedUnread(cachedItems);
        if (!cancelled) setByTab(summary.byTab);
      } catch {
        /* ignore */
      }
    }

    void refresh();
    const onSeen = () => {
      if (cachedItems.length === 0) {
        void refresh();
        return;
      }
      const summary = summarizeFeedUnread(cachedItems);
      setByTab(summary.byTab);
    };
    window.addEventListener("axe:feed-seen", onSeen);
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener("axe:feed-seen", onSeen);
      window.clearInterval(id);
    };
  }, []);

  const visible = FEED_TABS.filter((tab) => (byTab[tab.id] ?? 0) > 0);
  if (visible.length === 0) return null;

  return (
    <span className="flex items-center gap-1" aria-label="Unread feed lanes">
      {visible.map((tab) => {
        const count = byTab[tab.id];
        return (
          <span
            key={tab.id}
            title={`${tab.label}: ${count}`}
            className={`flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full px-0.5 text-[7px] font-bold text-black ${tab.badgeBg}`}
          >
            {count > 9 ? "9+" : count}
          </span>
        );
      })}
    </span>
  );
}
