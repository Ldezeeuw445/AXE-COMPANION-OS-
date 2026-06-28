"use client";

/**
 * CockpitMorningBrief — displays today's AXE morning brief in the cockpit.
 * Briefs are delivered by cron (07:00 local daily, Sunday 21:00 weekly).
 * This panel only shows an existing brief — it never triggers generation.
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Sunrise } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { feedKindLabel, feedKindStyle } from "@/lib/feed/feedKindStyle";

type Brief = {
  title: string;
  body: string;
  highlights: Array<{ pair?: string }>;
  chat_prefill: string;
  briefing_date: string;
  briefing_type: string;
};

export function CockpitMorningBrief() {
  const briefStyle = feedKindStyle("briefing");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async () => {
    try {
      const res = await fetch("/api/cockpit/briefing");
      if (!res.ok) throw new Error("Failed to load brief");
      const data = await res.json();
      if (data.upgradeRequired) {
        setError("Morning brief is a Pro feature — upgrade at /upgrade");
        return;
      }
      setBrief(data.brief ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load brief");
    } finally {
      setLoading(false);
    }
  }, []);

  const forceRefresh = useCallback(async () => {
    setRefreshing(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchBrief();
  }, [fetchBrief]);

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
        <p className="mt-3 text-sm leading-relaxed text-tos-muted">
          Your personalized brief arrives at <span className="text-tos-text">07:00</span> in your
          local timezone. Check back after that, or refresh manually if you missed a delivery.
        </p>
        {error ? <p className="mt-2 text-[11px] text-tos-risk">{error}</p> : null}
        <button
          type="button"
          onClick={() => void forceRefresh()}
          disabled={refreshing}
          className={`mt-3 inline-flex items-center gap-1.5 text-[11px] ${briefStyle.text} hover:opacity-80 disabled:opacity-40`}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Generate now
        </button>
      </GlassPanel>
    );
  }

  const isWeekly = brief.briefing_type === "weekly";
  const kindLabel = feedKindLabel("briefing", {
    briefingType: isWeekly ? "weekly" : "daily",
  });

  const paragraphs = brief.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

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
          className="text-tos-dim transition-colors hover:opacity-80 disabled:opacity-40"
          title="Regenerate brief"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${briefStyle.text}`}>
        {brief.title}
      </p>

      <div className="space-y-2">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-[13px] leading-relaxed text-tos-text/90">
            {para}
          </p>
        ))}
      </div>

      {brief.highlights?.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {brief.highlights
            .filter((h) => h.pair)
            .map((h, i) => (
              <span
                key={i}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${briefStyle.badge}`}
              >
                {h.pair}
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
