"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { feedItemLinkLabel, inferFeedItemUrl } from "@/lib/feed/feedDeepLinks";
import { feedKindLabel, feedKindStyle } from "@/lib/feed/feedKindStyle";
import {
  FEED_TABS,
  type FeedTabId,
  itemBelongsToFeedTab,
  parseFeedTabParam,
} from "@/lib/feed/feedTabs";
import { stripBriefMarkdown } from "@/lib/briefing/briefBodyFormat";
import {
  getFeedTabLastSeenAt,
  markFeedTabItemsRead,
  AXE_FEED_LAST_SEEN_KEY,
} from "@/lib/feed/feedSeen";
import { countUnreadFeedItemsForTab } from "@/lib/feed/feedUnread";
import { cn } from "@/lib/utils";
import type { AxeFeedItem } from "@/types/feed";

export { getFeedTabLastSeenAt as getFeedLastSeenAt, AXE_FEED_LAST_SEEN_KEY };

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
  return feedKindLabel(item.kind, { briefingType: item.briefingType });
}

type AxeFeedClientProps = {
  initialTab?: FeedTabId;
};

export function AxeFeedClient({ initialTab = "morning_brief" }: AxeFeedClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<FeedTabId>(initialTab);
  const [items, setItems] = useState<AxeFeedItem[]>([]);
  const [tabUnread, setTabUnread] = useState<Record<FeedTabId, number>>({
    morning_brief: 0,
    daily_news: 0,
    market_recap: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [markReadDone, setMarkReadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tab = parseFeedTabParam(searchParams.get("tab") ?? initialTab);
    setActiveTab(tab);
  }, [searchParams, initialTab]);

  const refreshTabUnread = useCallback((list: AxeFeedItem[]) => {
    setTabUnread({
      morning_brief: countUnreadFeedItemsForTab(list, "morning_brief"),
      daily_news: countUnreadFeedItemsForTab(list, "daily_news"),
      market_recap: countUnreadFeedItemsForTab(list, "market_recap"),
    });
  }, []);

  const applyItems = useCallback(
    (list: AxeFeedItem[], markSeenTab?: FeedTabId) => {
      setItems(list);
      refreshTabUnread(list);
      if (markSeenTab) {
        markFeedTabItemsRead(markSeenTab, list);
        refreshTabUnread(list);
      }
    },
    [refreshTabUnread],
  );

  const loadFeed = useCallback(
    async (markSeenTab?: FeedTabId) => {
      const res = await fetch("/api/feed", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load feed");
      const json = (await res.json()) as { items?: AxeFeedItem[] };
      applyItems(json.items ?? [], markSeenTab);
    },
    [applyItems],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFeed();
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
    if (loading || items.length === 0) return;
    markFeedTabItemsRead(activeTab, items);
    refreshTabUnread(items);
  }, [activeTab, loading, items, refreshTabUnread]);

  useEffect(() => {
    const onSeen = () => refreshTabUnread(items);
    window.addEventListener("axe:feed-seen", onSeen);
    return () => window.removeEventListener("axe:feed-seen", onSeen);
  }, [items, refreshTabUnread]);

  const visibleItems = useMemo(
    () => items.filter((item) => itemBelongsToFeedTab(item, activeTab)),
    [items, activeTab],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, AxeFeedItem[]>();
    for (const item of visibleItems) {
      const key = dayKey(item.createdAt);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visibleItems]);

  const handleTabChange = (tab: FeedTabId) => {
    setActiveTab(tab);
    const href = tab === "morning_brief" ? "/feed" : `/feed?tab=${tab}`;
    router.replace(href, { scroll: false });
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshDone(false);
    try {
      await loadFeed();
      setRefreshDone(true);
      window.setTimeout(() => setRefreshDone(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkTabRead = () => {
    markFeedTabItemsRead(activeTab, items);
    refreshTabUnread(items);
    setMarkReadDone(true);
    window.setTimeout(() => setMarkReadDone(false), 1600);
  };

  const activeUnread = tabUnread[activeTab];

  if (loading) {
    return (
      <GlassPanel className="axe-body p-6 text-center text-tos-muted">
        Loading AXE feed…
      </GlassPanel>
    );
  }

  if (error) {
    return (
      <GlassPanel className="axe-body p-6 text-center text-tos-risk">
        {error}
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="AXE Feed categories"
      >
        {FEED_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const unread = tabUnread[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "axe-label relative shrink-0 rounded-lg border px-3 py-2 transition-[background-color,border-color,color] duration-[var(--motion-fast)]",
                isActive
                  ? cn(tab.accentBg, tab.accentBorder, tab.accentText)
                  : "border-transparent text-tos-dim hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-tos-muted",
              )}
            >
              {tab.label}
              {unread > 0 ? (
                <span
                  className={cn(
                    "ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[8px] font-bold text-black",
                    tab.badgeBg,
                  )}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="axe-label text-white/45">
          Last {FEED_HISTORY_DAYS} days · {visibleItems.length} items
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={cn(
              "axe-label inline-flex items-center gap-1 rounded-md px-2 py-1 transition-all active:scale-95 disabled:opacity-50",
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
          {activeUnread > 0 ? (
            <button
              type="button"
              onClick={handleMarkTabRead}
              className={cn(
                "axe-label inline-flex items-center gap-1 rounded-md px-2 py-1 transition-all active:scale-95",
                markReadDone
                  ? "bg-emerald-500/12 text-emerald-300"
                  : "text-cyan-400/90 hover:bg-cyan-400/10 hover:text-cyan-300",
              )}
            >
              {markReadDone ? <Check className="h-3 w-3" /> : null}
              {markReadDone ? "All read" : `Mark read (${activeUnread > 9 ? "9+" : activeUnread})`}
            </button>
          ) : (
            <span
              className={cn(
                "axe-label inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
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

      {visibleItems.length === 0 ? (
        <GlassPanel className="axe-body p-6 text-center">
          <p className="text-tos-muted">Nothing here yet.</p>
          <p className="mt-2 text-tos-dim">
            {activeTab === "morning_brief"
              ? "Your personal brief, trade drafts, and AXE notices will show here."
              : activeTab === "daily_news"
                ? "Daily News arrives around 07:00 Amsterdam — broadcast to all AXE users."
                : "Market Recap lands around 20:00 Amsterdam with the day’s wrap-up."}
          </p>
        </GlassPanel>
      ) : (
        grouped.map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="axe-section-label mb-2 px-0.5">{day}</h2>
            <ul className="flex flex-col gap-2.5">
              {dayItems.map((item) => {
                const href = inferFeedItemUrl(item);
                const linkLabel = feedItemLinkLabel(item);
                const style = feedKindStyle(item.kind);
                const panel = (
                  <GlassPanel className="p-4 transition-colors hover:border-white/12">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={cn("axe-section-label", style.text)}>{kindLabel(item)}</p>
                        <p className="axe-heading-sm mt-1 text-tos-text">{item.title}</p>
                        {item.body ? (
                          <p className="axe-body mt-1.5 text-tos-muted">{stripBriefMarkdown(item.body)}</p>
                        ) : null}
                      </div>
                      <span className="axe-label shrink-0 text-tos-dim">{formatWhen(item.createdAt)}</span>
                    </div>
                    {href ? (
                      <span className="axe-label mt-3 inline-flex text-cyan-400/90">{linkLabel} →</span>
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
        ))
      )}
    </div>
  );
}
