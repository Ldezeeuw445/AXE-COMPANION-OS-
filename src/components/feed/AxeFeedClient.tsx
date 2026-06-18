"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { countUnreadFeedItems } from "@/lib/feed/feedUnread";
import {
  getFeedLastSeenAt,
  markAllFeedItemsRead,
  AXE_FEED_LAST_SEEN_KEY,
} from "@/lib/feed/feedSeen";
import type { AxeFeedItem } from "@/types/feed";

export { getFeedLastSeenAt, AXE_FEED_LAST_SEEN_KEY };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const delta = now - d.getTime();
  if (delta < 60_000) return "Just now";
  if (delta < 3600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86400_000) return `${Math.floor(delta / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function kindLabel(kind: AxeFeedItem["kind"]): string {
  if (kind === "trade_draft") return "Trade draft";
  if (kind === "chart_action") return "Chart action";
  if (kind === "proactive") return "AXE noticed";
  return "System";
}

export function AxeFeedClient() {
  const [items, setItems] = useState<AxeFeedItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyItems = useCallback((list: AxeFeedItem[], markSeen: boolean) => {
    setItems(list);
    if (markSeen) {
      markAllFeedItemsRead(list);
      setUnread(0);
    } else {
      setUnread(countUnreadFeedItems(list, getFeedLastSeenAt()));
    }
  }, []);

  const loadFeed = useCallback(async (markSeen: boolean) => {
    const res = await fetch("/api/feed", { credentials: "include" });
    if (!res.ok) throw new Error("Could not load feed");
    const json = (await res.json()) as { items?: AxeFeedItem[] };
    applyItems(json.items ?? [], markSeen);
  }, [applyItems]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFeed(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFeed]);

  useEffect(() => {
    const onSeen = () => setUnread(0);
    window.addEventListener("axe:feed-seen", onSeen);
    return () => window.removeEventListener("axe:feed-seen", onSeen);
  }, []);

  const handleMarkAllRead = () => {
    markAllFeedItemsRead(items);
    setUnread(0);
  };

  if (loading) {
    return (
      <GlassPanel className="p-6 text-center text-sm text-tos-muted">
        Loading AXE feed…
      </GlassPanel>
    );
  }

  if (error) {
    return (
      <GlassPanel className="p-6 text-center text-sm text-tos-risk">
        {error}
      </GlassPanel>
    );
  }

  if (items.length === 0) {
    return (
      <GlassPanel className="p-6 text-center">
        <p className="text-sm text-tos-muted">Nothing in your feed yet.</p>
        <p className="mt-2 text-[11px] leading-relaxed text-tos-dim">
          AXE will post here when trades close, drafts are ready, chart actions queue, or news risk hits open exposure.
        </p>
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void loadFeed(false)}
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-tos-dim transition-colors hover:text-tos-muted"
        >
          Refresh
        </button>
        {unread > 0 ? (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-400/90 transition-colors hover:text-cyan-300"
          >
            Mark all read ({unread > 9 ? "9+" : unread})
          </button>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-tos-dim">
            All caught up
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.id}>
            <GlassPanel className="p-4 transition-colors hover:border-white/12">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-400/80">
                    {kindLabel(item.kind)}
                  </p>
                  <p className="mt-1 text-sm font-medium text-tos-text">{item.title}</p>
                  {item.body ? (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-tos-muted">{item.body}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-tos-dim">
                  {formatWhen(item.createdAt)}
                </span>
              </div>
              {item.url ? (
                <Link
                  href={item.url}
                  className="mt-3 inline-flex text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-400/90 hover:text-cyan-300"
                >
                  Open →
                </Link>
              ) : null}
            </GlassPanel>
          </li>
        ))}
      </ul>
    </div>
  );
}
