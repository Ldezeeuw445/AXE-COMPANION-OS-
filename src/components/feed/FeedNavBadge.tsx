"use client";

import { useEffect, useState } from "react";
import { getFeedLastSeenAt } from "@/components/feed/AxeFeedClient";
import { countUnreadFeedItems } from "@/lib/feed/feedUnread";
import type { AxeFeedItem } from "@/types/feed";

/** Unread dot for AXE chat tab — polls feed lightly. */
export function FeedNavBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/feed", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: AxeFeedItem[] };
        const count = countUnreadFeedItems(json.items ?? [], getFeedLastSeenAt());
        if (!cancelled) setUnread(count);
      } catch {
        /* ignore */
      }
    }

    void refresh();
    const onSeen = () => setUnread(0);
    window.addEventListener("axe:feed-seen", onSeen);
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener("axe:feed-seen", onSeen);
      clearInterval(id);
    };
  }, []);

  if (unread <= 0) return null;

  return (
    <span
      className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-cyan-400 px-0.5 text-[7px] font-bold text-black"
      aria-label={`${unread} unread feed items`}
    >
      {unread > 9 ? "9+" : unread}
    </span>
  );
}
