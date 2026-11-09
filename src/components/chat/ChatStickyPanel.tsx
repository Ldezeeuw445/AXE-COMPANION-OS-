"use client";

/**
 * Sticky collapsible chat top panel — symbol/TF pills, session brief, AXE feed
 * preview. Collapsed bar keeps the active symbol visible so traders don't lose
 * context when the expanded strip is tucked away.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import { useActiveSession } from "@/lib/session/activeSessionStore";
import { summarizeFeedUnread, feedUnreadBadgeClass } from "@/lib/feed/feedUnread";
import type { AxeFeedItem } from "@/types/feed";

const STORAGE_KEY = "axe.chat.stickyPanelExpanded";

type ChatStickyPanelProps = {
  children: ReactNode;
};

export function ChatStickyPanel({ children }: ChatStickyPanelProps) {
  const session = useActiveSession();
  const [expanded, setExpanded] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [unread, setUnread] = useState(0);
  const [badgeClass, setBadgeClass] = useState("bg-cyan-400");

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === "0" || raw === "false") setExpanded(false);
        else if (raw === "1" || raw === "true") setExpanded(true);
      } catch {
        /* ignore */
      }
      setHydrated(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [expanded, hydrated]);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/feed", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { items?: AxeFeedItem[] };
      const summary = summarizeFeedUnread(json.items ?? []);
      setUnread(summary.total);
      setBadgeClass(feedUnreadBadgeClass(summary.primaryTab));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => void refreshUnread());
    const onSeen = () => void refreshUnread();
    window.addEventListener("axe:feed-seen", onSeen);
    const interval = window.setInterval(() => void refreshUnread(), 60_000);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("axe:feed-seen", onSeen);
      window.clearInterval(interval);
    };
  }, [refreshUnread]);

  const tfLabel =
    CHART_TF_OPTIONS.find((option) => option.key === session.timeframe)?.label ??
    session.timeframe;

  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-white/[0.06] bg-[var(--tos-bg-base)]/95 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
        aria-expanded={expanded}
        aria-controls="chat-sticky-panel-body"
      >
        <span className="font-mono text-[11px] tracking-wider text-[#00d4f5]">
          {session.symbol}
          <span className="ml-1.5 text-white/45">{tfLabel}</span>
        </span>
        {unread > 0 ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[7px] font-bold text-black ${badgeClass}`}
            aria-label={`${unread} unread feed items`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-white/35">
          {expanded ? "Hide" : "Context"}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
      </button>

      <div
        id="chat-sticky-panel-body"
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
