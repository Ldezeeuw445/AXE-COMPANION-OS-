"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Sunrise, X, RefreshCw, Newspaper, ArrowRight, Check } from "lucide-react";
import { applyChatPrefill } from "@/lib/chat/chatPrefill";
import { useChatIntelMode } from "@/components/chat/ChatHeaderSwitch";
import { feedKindLabel, feedKindStyle } from "@/lib/feed/feedKindStyle";
import { BriefBodyContent } from "@/components/briefing/BriefBodyContent";
import type { BriefHighlight } from "@/lib/briefing/briefBodyFormat";
import { pairHighlights } from "@/lib/briefing/briefBodyFormat";

type Brief = {
  title: string;
  body: string;
  highlights: BriefHighlight[];
  chat_prefill: string;
  briefing_date: string;
  feed_url: string;
  briefing_type: string;
};

export function ChatMorningBrief() {
  const intelMode = useChatIntelMode();
  const briefStyle = feedKindStyle("briefing");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchBrief = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/cockpit/briefing");
      if (!res.ok) throw new Error("Failed to load brief");
      const data = await res.json();
      if (data.upgradeRequired) return false;
      if (data.delivering) {
        setDelivering(true);
        setBrief(null);
        return true;
      }
      setDelivering(false);
      setBrief(data.brief ?? null);
      return Boolean(data.brief);
    } catch (e) {
      console.warn("[ChatMorningBrief] Could not load brief:", e);
      setDelivering(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBrief();
  }, [fetchBrief]);

  useEffect(() => {
    if (!delivering) {
      stopPolling();
      return;
    }

    const started = Date.now();
    pollRef.current = setInterval(() => {
      if (Date.now() - started > 120_000) {
        stopPolling();
        setDelivering(false);
        return;
      }
      void fetchBrief().then((ready) => {
        if (ready) stopPolling();
      });
    }, 4000);

    return stopPolling;
  }, [delivering, fetchBrief, stopPolling]);

  const refreshBrief = useCallback(async () => {
    setRefreshing(true);
    setRefreshDone(false);
    try {
      const res = await fetch("/api/cockpit/briefing?force=true", { method: "POST" });
      if (!res.ok) throw new Error("Refresh failed");
      const data = await res.json();
      if (data.upgradeRequired) return;
      setBrief(data.brief ?? null);
      setRefreshDone(true);
      window.setTimeout(() => setRefreshDone(false), 1800);
    } catch (e) {
      console.warn("[ChatMorningBrief] Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const askAXE = useCallback((text: string) => {
    applyChatPrefill(text);
  }, []);

  if (intelMode) return null;
  if (dismissed) return null;

  if (loading || delivering) {
    if (!delivering) return null;
    return (
      <div
        className="mx-4 mb-3 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4"
        style={{ borderLeftColor: "var(--tos-accent-gold)", borderLeftWidth: 2 }}
      >
        <div className="flex items-center gap-2 text-tos-dim">
          <Sunrise className={`h-4 w-4 shrink-0 ${briefStyle.text}`} />
          <span className="text-[11px] uppercase tracking-[0.18em]">Generating morning brief…</span>
          <RefreshCw className="h-3.5 w-3.5 animate-spin opacity-70" />
        </div>
      </div>
    );
  }

  if (!brief) return null;

  const isWeekly = brief.briefing_type === "weekly";
  const kindLabel = feedKindLabel("briefing", {
    briefingType: isWeekly ? "weekly" : "daily",
  });

  const pairTags = pairHighlights(brief.highlights);

  return (
    <div
      className="mx-4 mb-3 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4"
      style={{ borderLeftColor: "var(--tos-accent-gold)", borderLeftWidth: 2 }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`tos-accent-dot shrink-0 ${briefStyle.dot}`} aria-hidden />
          <Sunrise className={`h-4 w-4 shrink-0 ${briefStyle.text}`} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tos-dim">
            {kindLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refreshBrief()}
            disabled={refreshing}
            className={`rounded p-1.5 transition-all active:scale-95 disabled:opacity-40 ${
              refreshDone
                ? "bg-emerald-500/15 text-emerald-300"
                : refreshing
                  ? "bg-white/[0.08] text-tos-text"
                  : `text-tos-dim hover:bg-white/[0.06] ${briefStyle.text}`
            }`}
            title="Regenerate brief"
          >
            {refreshDone ? (
              <Check className="h-3 w-3" />
            ) : (
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            )}
          </button>
          <button
            type="button"
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

      <p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${briefStyle.text}`}>
        {brief.title}
      </p>

      <div className="mb-3">
        <BriefBodyContent body={brief.body} highlights={brief.highlights} compact />
      </div>

      {pairTags.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {pairTags.map((pair, i) => (
              <span
                key={i}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${briefStyle.badge}`}
              >
                {pair}
              </span>
            ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => askAXE(brief.chat_prefill || "Tell me more about today's setup")}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${briefStyle.badge} hover:opacity-90`}
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
