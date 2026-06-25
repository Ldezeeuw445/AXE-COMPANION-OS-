"use client";

/**
 * CockpitMorningBrief — displays today's AXE morning brief.
 * Fetches from /api/cockpit/briefing and auto-generates if not yet available.
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Sunrise } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";

type Brief = {
  title: string;
  body: string;
  highlights: Array<{ pair?: string }>;
  chat_prefill: string;
  briefing_date: string;
};

export function CockpitMorningBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async () => {
    try {
      const res = await fetch("/api/cockpit/briefing");
      if (!res.ok) throw new Error("Failed to load brief");
      const data = await res.json();
      setBrief(data.brief ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load brief");
    } finally {
      setLoading(false);
    }
  }, []);

  const generateBrief = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/cockpit/briefing", { method: "POST" });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setBrief(data.brief ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  // Auto-generate if no brief exists
  useEffect(() => {
    if (!loading && brief === null && !generating) {
      generateBrief();
    }
  }, [loading, brief, generating, generateBrief]);

  if (loading) {
    return (
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2 text-tos-dim">
          <Sunrise className="h-4 w-4 shrink-0 opacity-60" />
          <span className="text-[11px] uppercase tracking-[0.18em]">
            Loading morning brief…
          </span>
        </div>
      </GlassPanel>
    );
  }

  if (generating) {
    return (
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2 text-tos-warm">
          <Sunrise className="h-4 w-4 shrink-0 animate-pulse" />
          <span className="text-[11px] uppercase tracking-[0.18em]">
            AXE is writing your morning brief…
          </span>
        </div>
      </GlassPanel>
    );
  }

  if (error && !brief) {
    return (
      <GlassPanel className="p-5">
        <p className="text-[11px] text-tos-dim">{error}</p>
        <button
          onClick={generateBrief}
          className="mt-2 flex items-center gap-1.5 text-[11px] text-tos-warm hover:opacity-80"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </GlassPanel>
    );
  }

  if (!brief) return null;

  // Parse briefing body into paragraphs
  const paragraphs = brief.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <GlassPanel className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sunrise className="h-4 w-4 shrink-0 text-tos-warm" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tos-dim">
            Morning Brief
          </span>
        </div>
        <button
          onClick={() => {
            setBrief(null);
            setGenerating(false);
            fetch("/api/cockpit/briefing?force=true", { method: "POST" })
              .then((r) => r.json())
              .then((d) => setBrief(d.brief ?? null))
              .catch(() => {});
          }}
          className="text-[10px] text-tos-dim hover:text-tos-warm transition-colors"
          title="Regenerate brief"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Brief title */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tos-warm/80 mb-2">
        {brief.title}
      </p>

      {/* Brief body */}
      <div className="space-y-2">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-[13px] leading-relaxed text-tos-text/90">
            {para}
          </p>
        ))}
      </div>

      {/* Pairs highlight */}
      {brief.highlights?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {brief.highlights
            .filter((h) => h.pair)
            .map((h, i) => (
              <span
                key={i}
                className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-tos-warm/10 text-tos-warm"
              >
                {h.pair}
              </span>
            ))}
        </div>
      )}

      {/* Chat prefill link */}
      {brief.chat_prefill && (
        <p className="mt-3 text-[11px] text-tos-dim italic">
          💬 Ask AXE: &ldquo;{brief.chat_prefill}&rdquo;
        </p>
      )}
    </GlassPanel>
  );
}
