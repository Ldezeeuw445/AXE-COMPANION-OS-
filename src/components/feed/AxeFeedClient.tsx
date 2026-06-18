"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { AxeFeedItem } from "@/types/feed";

const LAST_SEEN_KEY = "axe.feed.lastSeenAt";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/feed", { credentials: "include" });
        if (!res.ok) throw new Error("Could not load feed");
        const json = (await res.json()) as { items?: AxeFeedItem[] };
        if (!cancelled) setItems(json.items ?? []);
        try {
          localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
          window.dispatchEvent(new CustomEvent("axe:feed-seen"));
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  );
}

export function getFeedLastSeenAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export const AXE_FEED_LAST_SEEN_KEY = LAST_SEEN_KEY;
