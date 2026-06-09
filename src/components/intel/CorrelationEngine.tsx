"use client";

/**
 * AXE Correlation Engine — auto-detects cross-feed patterns
 * and shows historical déjà-vu matches.
 *
 * Fetches from /api/intel-correlations on mount.
 * Shows 3-5 correlations with expandable evidence chains.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, History, RefreshCw } from "lucide-react";

type FeedSignal = { feed: string; signal: string };

type Correlation = {
  id: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  signal: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  feedsUsed: string[];
  symbols: string[];
  supporting: FeedSignal[];
};

type HistoricalMatch = {
  title: string;
  date: string;
  similarity: "strong" | "moderate";
};

type CorrelationSnapshot = {
  correlations: Correlation[];
  historicalMatches: HistoricalMatch[];
  generatedAt: string;
};

export function CorrelationEngine() {
  const [data, setData] = useState<CorrelationSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intel-correlations", { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        snapshot?: CorrelationSnapshot;
        error?: string;
      };
      if (json.ok && json.snapshot) setData(json.snapshot);
      else setError(json.error ?? "Failed");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confBadge = (c: "high" | "medium" | "low") =>
    c === "high"
      ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
      : c === "medium"
        ? "border-amber-300/20 bg-amber-300/[0.06] text-amber-200"
        : "border-white/[0.08] bg-white/[0.03] text-white/50";

  const signalBadge = (s: string | null) => {
    if (!s) return null;
    const cls =
      s === "BULLISH"
        ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
        : s === "BEARISH"
          ? "border-red-400/20 bg-red-400/[0.06] text-red-300"
          : "border-white/[0.08] bg-white/[0.03] text-white/50";
    return (
      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
        {s}
      </span>
    );
  };

  return (
    <section className="mb-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <GitBranch size={14} className="text-cyan-400" />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/90">
            AXE Correlation Engine
          </h2>
        </div>
        <button
          onClick={fetch_}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/40 transition-colors hover:border-cyan-400/20 hover:text-cyan-300 disabled:opacity-30"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          {loading ? "Scanning…" : "Rescan"}
        </button>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.03] p-8">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/50"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-300/60">
            Cross-referencing 13 feeds for patterns…
          </p>
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="rounded-2xl border border-red-400/10 bg-red-400/[0.03] p-4 text-center text-[12px] text-red-300/70">
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-2.5">
          {data.correlations.map((c) => {
            const isOpen = expanded.has(c.id);
            return (
              <div
                key={c.id}
                className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-colors"
              >
                {/* Header row */}
                <button
                  onClick={() => toggle(c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown size={12} className="shrink-0 text-white/30" />
                  ) : (
                    <ChevronRight size={12} className="shrink-0 text-white/30" />
                  )}

                  <div className="min-w-0 flex-1">
                    <span className="text-[12px] font-semibold text-white/85">{c.title}</span>
                  </div>

                  {/* Badges */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {signalBadge(c.signal)}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${confBadge(c.confidence)}`}
                    >
                      {c.confidence}
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t border-white/[0.04] px-4 pb-4 pt-3">
                    {/* Summary */}
                    <p className="mb-3 text-[11px] leading-relaxed text-white/60">{c.summary}</p>

                    {/* Feed chain visualization */}
                    <div className="mb-3 flex flex-wrap items-center gap-1">
                      {c.feedsUsed.map((feed, i) => (
                        <span key={feed} className="flex items-center gap-1">
                          <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-300/70">
                            {feed}
                          </span>
                          {i < c.feedsUsed.length - 1 && (
                            <span className="text-[10px] text-white/20">→</span>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Supporting evidence */}
                    {c.supporting.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {c.supporting.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-[10px]">
                            <span className="mt-0.5 shrink-0 text-cyan-400/60">◆</span>
                            <span className="text-white/40">
                              <span className="font-medium text-white/55">{s.feed}</span>
                              {" — "}
                              {s.signal}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Symbols */}
                    {c.symbols.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.symbols.map((sym) => (
                          <span
                            key={sym}
                            className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.04] px-2 py-0.5 font-mono text-[9px] font-semibold text-cyan-300/60"
                          >
                            {sym}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Historical matches */}
          {data.historicalMatches.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.02] px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <History size={12} className="text-amber-300/60" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/60">
                  Déjà Vu — Similar Patterns Detected
                </span>
              </div>
              <div className="space-y-1">
                {data.historicalMatches.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        h.similarity === "strong" ? "bg-amber-300" : "bg-amber-300/40"
                      }`}
                    />
                    <span className="text-white/50">
                      <span className="font-medium text-white/65">{h.title}</span>
                      {" — "}
                      {h.date}
                      <span className="ml-1.5 text-[9px] text-amber-200/40">
                        ({h.similarity})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
