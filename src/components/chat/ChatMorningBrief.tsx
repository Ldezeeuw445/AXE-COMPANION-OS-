"use client";

/**
 * ChatMorningBrief — surfaces today's AXE morning brief inside the chat thread.
 *
 * Briefs are delivered by cron (7am local daily, Sunday evening weekly).
 * This card only displays an existing brief — it never triggers generation.
 */

import { useEffect, useState, useCallback } from "react";
import { Sunrise, X, RefreshCw, Newspaper, ArrowRight } from "lucide-react";
import { applyChatPrefill } from "@/lib/chat/chatPrefill";
import { useChatIntelMode } from "@/components/chat/ChatHeaderSwitch";

type Brief = {
  title: string;
  body: string;
  highlights: Array<{ pair?: string }>;
  chat_prefill: string;
  briefing_date: string;
  feed_url: string;
  briefing_type: string;
};

export function ChatMorningBrief() {
  const intelMode = useChatIntelMode();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchBrief = useCallback(async () => {
    try {
      const res = await fetch("/api/cockpit/briefing");
      if (!res.ok) throw new Error("Failed to load brief");
      const data = await res.json();
      if (data.upgradeRequired) return;
      setBrief(data.brief ?? null);
    } catch (e) {
      console.warn("[ChatMorningBrief] Could not load brief:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBrief = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/cockpit/briefing?force=true", { method: "POST" });
      if (!res.ok) throw new Error("Refresh failed");
      const data = await res.json();
      if (data.upgradeRequired) return;
      setBrief(data.brief ?? null);
    } catch (e) {
      console.warn("[ChatMorningBrief] Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  const askAXE = useCallback((text: string) => {
    applyChatPrefill(text);
  }, []);

  if (intelMode) return null;
  if (dismissed || loading || !brief) return null;

  const paragraphs = brief.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sunrise className="h-4 w-4 shrink-0 text-tos-gold" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tos-dim">
            {brief.briefing_type === "weekly" ? "Weekly Outlook" : "Morning Brief"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void refreshBrief()}
            disabled={refreshing}
            className="rounded p-1.5 text-tos-dim hover:bg-white/[0.06] hover:text-tos-gold disabled:opacity-40"
            title="Regenerate brief"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => {
              if (brief.briefing_type === "weekly") {
                void fetch(
                  `/api/cockpit/briefing?read=true&date=${encodeURIComponent(brief.briefing_date)}&type=weekly`,
                  { method: "POST" },
                );
              }
              setDismissed(true);
            }}
            className="rounded p-1.5 text-tos-dim hover:bg-white/[0.06] hover:text-white"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-tos-gold/90">
        {brief.title}
      </p>

      <div className="mb-3 space-y-1.5">
        {paragraphs.slice(0, 2).map((para, i) => (
          <p key={i} className="text-[12px] leading-relaxed text-tos-text/85">
            {para}
          </p>
        ))}
      </div>

      {brief.highlights?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {brief.highlights
            .filter((h) => h.pair)
            .map((h, i) => (
              <span
                key={i}
                className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-tos-gold/10 text-tos-gold"
              >
                {h.pair}
              </span>
            ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => askAXE(brief.chat_prefill || "Tell me more about today's setup")}
          className="inline-flex items-center gap-1.5 rounded-full bg-tos-gold/10 px-3 py-1.5 text-[11px] font-medium text-tos-gold transition-colors hover:bg-tos-gold/20"
        >
          <ArrowRight className="h-3 w-3" />
          Ask AXE about this
        </button>
        <a
          href={brief.feed_url || "/feed"}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <Newspaper className="h-3 w-3" />
          AXE Feed
        </a>
      </div>
    </div>
  );
}
