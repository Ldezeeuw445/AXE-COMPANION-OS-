"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countUnreadFeedItems } from "@/lib/feed/feedUnread";
import { inferFeedItemUrl } from "@/lib/feed/feedDeepLinks";
import { getFeedLastSeenAt, markAllFeedItemsRead } from "@/lib/feed/feedSeen";
import { isTabletViewport } from "@/lib/viewport/tablet";
import type { AxeFeedItem } from "@/types/feed";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const delta = Date.now() - d.getTime();
  if (delta < 60_000) return "Just now";
  if (delta < 3600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3600_000)}h ago`;
}

import { useChatIntelMode } from "@/components/chat/ChatHeaderSwitch";

/** Compact AXE feed strip above chat — latest notices with link to full feed. */
export function ChatFeedStrip() {
  const intelMode = useChatIntelMode();
  const [items, setItems] = useState<AxeFeedItem[]>([]);
  const [allItems, setAllItems] = useState<AxeFeedItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const sync = () => setIsTablet(isTabletViewport());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/feed", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { items?: AxeFeedItem[] };
        const list = json.items ?? [];
        if (!cancelled) {
          setAllItems(list);
          const visibleCount = isTablet ? 1 : 2;
          setItems(list.slice(0, visibleCount));
          setUnread(countUnreadFeedItems(list, getFeedLastSeenAt()));
        }
      } catch {
        /* ignore */
      }
    }

    void load();
    const onSeen = () => setUnread(0);
    window.addEventListener("axe:feed-seen", onSeen);
    const id = setInterval(load, 45_000);
    return () => {
      cancelled = true;
      window.removeEventListener("axe:feed-seen", onSeen);
      clearInterval(id);
    };
  }, [isTablet]);

  const handleMarkRead = () => {
    markAllFeedItemsRead(allItems);
    setUnread(0);
  };

  if (intelMode) return null;
  if (items.length === 0) return null;

  const bodyLimit = isTablet ? 48 : 72;

  return (
    <div
      id="chat-feed-strip"
      className={`shrink-0 border-b border-white/[0.06] bg-gradient-to-b from-[#0e0e12] to-[#060608] ${
        isTablet ? "px-2 py-1" : "px-3 py-2"
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${isTablet ? "mb-1" : "mb-1.5"}`}>
        <span
          className={`flex items-center gap-1.5 font-semibold uppercase tracking-[0.16em] text-white/82 ${
            isTablet ? "text-[8px]" : "text-[9px]"
          }`}
        >
          <span className="tos-accent-dot tos-accent-dot--cyan" aria-hidden />
          AXE Feed
          {unread > 0 ? (
            <span className="rounded-full bg-cyan-400 px-1.5 py-0.5 text-[7px] font-bold text-black">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkRead}
              className={`font-semibold uppercase tracking-wider text-white/45 transition-colors hover:text-white/70 ${
                isTablet ? "text-[8px]" : "text-[9px]"
              }`}
            >
              Mark read
            </button>
          ) : null}
          <Link
            href="/feed"
            className={`font-semibold uppercase tracking-wider text-cyan-400/80 hover:text-cyan-300 ${
              isTablet ? "text-[8px]" : "text-[9px]"
            }`}
          >
            {isTablet ? "Feed →" : "Open feed →"}
          </Link>
        </div>
      </div>
      <ul className={isTablet ? "flex flex-col gap-0.5" : "flex flex-col gap-1"}>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={inferFeedItemUrl(item) ?? "/feed"}
              className={`tos-matte-banner flex items-center justify-between gap-2 transition-colors hover:border-white/[0.1] ${
                isTablet ? "px-2 py-1" : ""
              }`}
            >
              <span
                className={`min-w-0 leading-snug text-white/85 ${
                  isTablet ? "truncate text-[10px] leading-tight" : "text-[11px] leading-snug"
                }`}
              >
                <span
                  className={`font-medium ${
                    item.kind === "briefing" ? "text-tos-gold/95" : "text-cyan-100/90"
                  }`}
                >
                  {item.title}
                </span>
                {!isTablet && item.body ? (
                  <span className="text-white/55">
                    {" "}
                    — {item.body.length > bodyLimit ? `${item.body.slice(0, bodyLimit)}…` : item.body}
                  </span>
                ) : null}
              </span>
              <span
                className={`shrink-0 uppercase tracking-wide text-white/35 ${
                  isTablet ? "text-[8px]" : "text-[9px]"
                }`}
              >
                {formatWhen(item.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
