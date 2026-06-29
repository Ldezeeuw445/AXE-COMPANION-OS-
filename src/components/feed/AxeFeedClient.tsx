"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { countUnreadFeedItems } from "@/lib/feed/feedUnread";
import { feedItemLinkLabel, inferFeedItemUrl } from "@/lib/feed/feedDeepLinks";
import { feedKindLabel, feedKindStyle } from "@/lib/feed/feedKindStyle";
import { stripBriefMarkdown } from "@/lib/briefing/briefBodyFormat";
import {
  getFeedLastSeenAt,
  markAllFeedItemsRead,
  AXE_FEED_LAST_SEEN_KEY,
} from "@/lib/feed/feedSeen";
import { cn } from "@/lib/utils";
import type { AxeFeedItem } from "@/types/feed";

export { getFeedLastSeenAt, AXE_FEED_LAST_SEEN_KEY };

const FEED_HISTORY_DAYS = 7;

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

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

function kindLabel(item: AxeFeedItem): string {
  return feedKindLabel(item.kind, {
    briefingType: item.briefingType,
  });
}

export function AxeFeedClient() {
  const [items, setItems] = useState<AxeFeedItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [markReadDone, setMarkReadDone] = useState(false);
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

  const grouped = useMemo(() => {
    const map = new Map<string, AxeFeedItem[]>();
    for (const item of items) {
      const key = dayKey(item.createdAt);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshDone(false);
    try {
      await loadFeed(false);
      setRefreshDone(true);
      window.setTimeout(() => setRefreshDone(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkAllRead = () => {
    markAllFeedItemsRead(items);
    setUnread(0);
    setMarkReadDone(true);
    window.setTimeout(() => setMarkReadDone(false), 1600);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          Last {FEED_HISTORY_DAYS} days · {items.length} items
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all active:scale-95 disabled:opacity-50",
              refreshDone
                ? "bg-emerald-500/12 text-emerald-300"
                : refreshing
                  ? "bg-white/[0.06] text-tos-text"
                  : "text-tos-dim hover:bg-white/[0.05] hover:text-tos-muted",
            )}
          >
            {refreshDone ? (
              <Check className="h-3 w-3" />
            ) : (
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            )}
            {refreshDone ? "Refreshed" : refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all active:scale-95",
                markReadDone
                  ? "bg-emerald-500/12 text-emerald-300"
                  : "text-cyan-400/90 hover:bg-cyan-400/10 hover:text-cyan-300",
              )}
            >
              {markReadDone ? <Check className="h-3 w-3" /> : null}
              {markReadDone ? "All read" : `Mark all read (${unread > 9 ? "9+" : unread})`}
            </button>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                markReadDone || refreshDone
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "text-tos-dim",
              )}
            >
              {(markReadDone || refreshDone) && <Check className="h-3 w-3" />}
              All caught up
            </span>
          )}
        </div>
      </div>

      {grouped.map(([day, dayItems]) => (
        <section key={day}>
          <h2 className="mb-2 px-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
            {day}
          </h2>
          <ul className="flex flex-col gap-2.5">
            {dayItems.map((item) => {
              const href = inferFeedItemUrl(item);
              const linkLabel = feedItemLinkLabel(item);
              const style = feedKindStyle(item.kind);
              const panel = (
                <GlassPanel className="p-4 transition-colors hover:border-white/12">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${style.text}`}>
                        {kindLabel(item)}
                      </p>
                      <p className="mt-1 text-sm font-medium text-tos-text">{item.title}</p>
                      {item.body ? (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-tos-muted">
                          {stripBriefMarkdown(item.body)}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-tos-dim">
                      {formatWhen(item.createdAt)}
                    </span>
                  </div>
                  {href ? (
                    <span className="mt-3 inline-flex text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-400/90">
                      {linkLabel} →
                    </span>
                  ) : null}
                </GlassPanel>
              );

              return (
                <li key={item.id}>
                  {href ? (
                    <Link
                      href={href}
                      className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400/50"
                    >
                      {panel}
                    </Link>
                  ) : (
                    panel
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
