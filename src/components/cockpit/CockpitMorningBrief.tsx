"use client";

/**
 * CockpitMorningBrief — displays today's AXE morning brief in the cockpit.
 * Briefs are delivered by cron (07:00 local daily, Monday 07:00 weekly) or
 * auto-generated on first visit after 07:00 if cron missed delivery.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Sunrise, Check } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { feedKindLabel, feedKindStyle } from "@/lib/feed/feedKindStyle";
import { BriefBodyContent } from "@/components/briefing/BriefBodyContent";
import type { BriefHighlight } from "@/lib/briefing/briefBodyFormat";
import { pairHighlights } from "@/lib/briefing/briefBodyFormat";
import { cn } from "@/lib/utils";

type Brief = {
  title: string;
  body: string;
  highlights: BriefHighlight[];
  chat_prefill: string;
  briefing_date: string;
  briefing_type: string;
};

export function CockpitMorningBrief() {
  const briefStyle = feedKindStyle("briefing");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      if (data.upgradeRequired) {
        setError("Morning brief is a Pro feature — upgrade at /upgrade");
        return false;
      }
      if (data.delivering) {
        setDelivering(true);
        setBrief(null);
        setError(null);
        return true;
      }
      setDelivering(false);
      setBrief(data.brief ?? null);
      setError(null);
      return Boolean(data.brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load brief");
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
        setError("Brief generation is taking longer than expected — try Generate now");
        return;
      }
      void fetchBrief().then((ready) => {
        if (ready) stopPolling();
      });
    }, 4000);

    return stopPolling;
  }, [delivering, fetchBrief, stopPolling]);

  const forceRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshDone(false);
    setError(null);
    try {
      const res = await fetch("/api/cockpit/briefing?force=true", { method: "POST" });
      if (!res.ok) throw new Error("Refresh failed");
      const data = await res.json();
      if (data.upgradeRequired) {
        setError("Morning brief is a Pro feature — upgrade at /upgrade");
        return;
      }
      setBrief(data.brief ?? null);
      setRefreshDone(true);
      window.setTimeout(() => setRefreshDone(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  if (loading) {
    return (
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2 text-tos-dim">
          <Sunrise className="h-4 w-4 shrink-0 opacity-60" />
          <span className="text-[11px] uppercase tracking-[0.18em]">Loading morning brief…</span>
        </div>
      </GlassPanel>
    );
  }

  if (!brief) {
    return (
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <span className={`tos-accent-dot shrink-0 ${briefStyle.dot}`} aria-hidden />
          <Sunrise className={`h-4 w-4 shrink-0 ${briefStyle.text}`} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tos-dim">
            Morning brief
          </span>
        </div>
        {delivering ? (
          <p className="mt-3 text-sm leading-relaxed text-tos-muted">
            Generating your morning brief…
            <RefreshCw className="ml-1.5 inline h-3.5 w-3.5 animate-spin align-[-2px] opacity-70" />
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-tos-muted">
            Your personalized brief arrives at <span className="text-tos-text">07:00</span> in your
            local timezone. If you open the app after that, it generates automatically.
          </p>
        )}
        {error ? <p className="mt-2 text-[11px] text-tos-risk">{error}</p> : null}
        <button
          type="button"
          onClick={() => void forceRefresh()}
          disabled={refreshing}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all active:scale-95 disabled:opacity-40",
            refreshDone
              ? "bg-emerald-500/15 text-emerald-300"
              : refreshing
                ? "bg-white/[0.06] text-tos-text"
                : `${briefStyle.text} hover:bg-white/[0.04] hover:opacity-90`,
          )}
        >
          {refreshDone ? (
            <Check className="h-3 w-3" />
          ) : (
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          )}
          {refreshDone ? "Updated" : refreshing ? "Generating…" : "Generate now"}
        </button>
      </GlassPanel>
    );
  }

  const isWeekly = brief.briefing_type === "weekly";
  const kindLabel = feedKindLabel("briefing", {
    briefingType: isWeekly ? "weekly" : "daily",
  });

  const pairTags = pairHighlights(brief.highlights);

  return (
    <GlassPanel className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`tos-accent-dot shrink-0 ${briefStyle.dot}`} aria-hidden />
          <Sunrise className={`h-4 w-4 shrink-0 ${briefStyle.text}`} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tos-dim">
            {kindLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void forceRefresh()}
          disabled={refreshing}
          className={cn(
            "rounded-md p-1.5 transition-all active:scale-95 disabled:opacity-40",
            refreshDone
              ? "bg-emerald-500/15 text-emerald-300"
              : refreshing
                ? "bg-white/[0.06] text-tos-text"
                : "text-tos-dim hover:bg-white/[0.06] hover:opacity-80",
          )}
          title="Regenerate brief"
        >
          {refreshDone ? (
            <Check className="h-3 w-3" />
          ) : (
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          )}
        </button>
      </div>

      <p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${briefStyle.text}`}>
        {brief.title}
      </p>

      <BriefBodyContent body={brief.body} highlights={brief.highlights} />

      {pairTags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
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

      {brief.chat_prefill ? (
        <p className="mt-3 text-[11px] italic text-tos-dim">
          Ask AXE: &ldquo;{brief.chat_prefill}&rdquo;
        </p>
      ) : null}
    </GlassPanel>
  );
}
