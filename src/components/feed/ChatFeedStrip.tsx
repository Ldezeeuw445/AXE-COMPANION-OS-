"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Rss } from "lucide-react";
import { getFeedLastSeenAt } from "@/components/feed/AxeFeedClient";
import { countUnreadFeedItems } from "@/lib/feed/feedUnread";
import type { AxeFeedItem } from "@/types/feed";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const delta = Date.now() - d.getTime();
  if (delta < 60_000) return "Just now";
  if (delta < 3600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3600_000)}h ago`;
}

/** Compact AXE feed strip above chat — latest notices with link to full feed. */
export function ChatFeedStrip() {
  const [items, setItems] = useState<AxeFeedItem[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/feed", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { items?: AxeFeedItem[] };
        const list = json.items ?? [];
        if (!cancelled) {
          setItems(list.slice(0, 2));
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
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-300/85">
          <Rss className="h-3 w-3" aria-hidden />
          AXE Feed
          {unread > 0 ? (
            <span className="rounded-full bg-cyan-400 px-1.5 py-0.5 text-[7px] font-bold text-black">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
        <Link
          href="/feed"
          className="text-[9px] font-semibold uppercase tracking-wider text-cyan-400/80 hover:text-cyan-300"
        >
          Open feed →
        </Link>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.url ?? "/feed"}
              className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-1.5 transition-colors hover:border-cyan-400/20 hover:bg-cyan-400/[0.06]"
            >
              <span className="min-w-0 text-[11px] leading-snug text-white/85">
                <span className="font-medium text-cyan-100/90">{item.title}</span>
                {item.body ? (
                  <span className="text-white/55"> — {item.body.length > 72 ? `${item.body.slice(0, 72)}…` : item.body}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-white/35">
                {formatWhen(item.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
