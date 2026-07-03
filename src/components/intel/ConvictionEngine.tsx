"use client";

/**
 * AXE Conviction Engine — shows per-asset conviction scores
 * with expandable "WHY?" reasoning chains.
 *
 * Fetches from /api/intel-conviction on mount.
 * Cached for 30 min server-side so it doesn't burn GPT-4o credits.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SupportingSignal = { feed: string; signal: string };

type AssetConviction = {
  asset: string;
  ticker: string;
  direction: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  reasoning: string;
  supporting: SupportingSignal[];
  contradicting: SupportingSignal[];
};

type ConvictionSnapshot = {
  id: string;
  generatedAt: string;
  convictions: AssetConviction[];
  marketSentence: string;
};

const CACHE_KEY = "axe.intel.conviction.snapshot.v1";

export function ConvictionEngine() {
  const [data, setData] = useState<ConvictionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchConvictions = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      // Send Bearer token so server auth works regardless of cookie state
      let authHeader: Record<string, string> = {};
      try {
        const sb = createClient();
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) {
          authHeader = { Authorization: `Bearer ${session.access_token}` };
        }
      } catch { /* ignore — server will try cookie fallback */ }

      const res = await fetch("/api/intel-conviction", {
        method: "POST",
        headers: authHeader,
      });
      const json = (await res.json()) as {
        ok: boolean;
        conviction?: ConvictionSnapshot;
        error?: string;
      };
      if (json.ok && json.conviction) {
        setData(json.conviction);
        try {
          const serialized = JSON.stringify(json.conviction);
          window.sessionStorage.setItem(CACHE_KEY, serialized);
          window.localStorage.setItem(CACHE_KEY, serialized);
        } catch {
          /* ignore */
        }
      } else {
        setError(json.error ?? "Failed to generate convictions");
      }
    } catch {
      setError("Network error");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let hasFreshCache = false;
    try {
      const cached = window.sessionStorage.getItem(CACHE_KEY) ?? window.localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as ConvictionSnapshot;
        setData(parsed);
        const ageMs = Date.now() - new Date(parsed.generatedAt).getTime();
        hasFreshCache = Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 12 * 60 * 1000;
      }
    } catch {
      /* ignore */
    }
    const run = () => void fetchConvictions(hasFreshCache);
    if (hasFreshCache) {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        const w = window as Window & {
          requestIdleCallback: (cb: IdleRequestCallback) => number;
          cancelIdleCallback?: (id: number) => void;
        };
        const idleId = w.requestIdleCallback(() => run());
        return () => w.cancelIdleCallback?.(idleId);
      }
      const t = window.setTimeout(run, 220);
      return () => window.clearTimeout(t);
    }
    run();
  }, [fetchConvictions]);

  const toggle = (ticker: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const dirColor = (d: string) =>
    d === "Bullish"
      ? "text-emerald-400"
      : d === "Bearish"
        ? "text-red-400"
        : "text-white/50";

  const dirBg = (d: string) =>
    d === "Bullish"
      ? "bg-emerald-400/[0.06] border-emerald-400/15"
      : d === "Bearish"
        ? "bg-red-400/[0.06] border-red-400/15"
        : "bg-white/[0.03] border-white/[0.06]";

  const confColor = (c: number) =>
    c >= 75 ? "text-emerald-400" : c >= 60 ? "text-cyan-300" : "text-white/40";

  const confBarColor = (d: string) =>
    d === "Bullish" ? "bg-emerald-400" : d === "Bearish" ? "bg-red-400" : "bg-white/30";

  return (
    <section className="mt-8 mb-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Zap size={14} className="text-cyan-400" />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/90">
            AXE Market Conviction
          </h2>
        </div>
        <button
          onClick={() => void fetchConvictions(false)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/40 transition-colors hover:border-cyan-400/20 hover:text-cyan-300 disabled:opacity-30"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          {loading ? "Analyzing…" : "Refresh"}
        </button>
      </div>

      {/* Loading state */}
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
            AXE is analyzing 13 intelligence feeds…
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !data && (
        <div className="rounded-2xl border border-red-400/10 bg-red-400/[0.03] p-4 text-center text-[12px] text-red-300/70">
          {error}
        </div>
      )}

      {/* Conviction data */}
      {data && (
        <div className="space-y-3">
          {/* Market sentence */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-[12px] font-medium leading-relaxed text-white/70">
              {data.marketSentence}
            </p>
            <p className="mt-1.5 text-[9px] uppercase tracking-wider text-white/20">
              {new Date(data.generatedAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* Conviction cards */}
          {data.convictions.map((c) => {
            const isOpen = expanded.has(c.ticker);
            return (
              <div
                key={c.ticker}
                className={`overflow-hidden rounded-xl border transition-colors ${dirBg(c.direction)}`}
              >
                {/* Compact row */}
                <button
                  onClick={() => toggle(c.ticker)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {/* Expand chevron */}
                  {isOpen ? (
                    <ChevronDown size={12} className="shrink-0 text-white/30" />
                  ) : (
                    <ChevronRight size={12} className="shrink-0 text-white/30" />
                  )}

                  {/* Asset name + ticker */}
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-white/90">
                      {c.asset}
                    </span>
                    <span className="ml-2 text-[10px] font-medium text-white/30">
                      {c.ticker}
                    </span>
                  </div>

                  {/* Direction */}
                  <span
                    className={`shrink-0 text-[12px] font-bold uppercase tracking-wider ${dirColor(c.direction)}`}
                  >
                    {c.direction}
                  </span>

                  {/* Confidence bar + number */}
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full ${confBarColor(c.direction)} transition-all`}
                        style={{ width: `${c.confidence}%` }}
                      />
                    </div>
                    <span className={`w-8 text-right text-[12px] font-bold tabular-nums ${confColor(c.confidence)}`}>
                      {c.confidence}%
                    </span>
                  </div>
                </button>

                {/* Expanded: WHY? */}
                {isOpen && (
                  <div className="border-t border-white/[0.04] px-4 pb-4 pt-3">
                    {/* Reasoning */}
                    <p className="mb-3 text-[11px] leading-relaxed text-white/60">
                      {c.reasoning}
                    </p>

                    {/* Supporting signals */}
                    {c.supporting.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-400/60">
                          Supporting
                        </p>
                        <div className="space-y-1">
                          {c.supporting.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 text-[10px]">
                              <span className="mt-0.5 shrink-0 text-emerald-400/70">✓</span>
                              <span className="text-white/40">
                                <span className="font-medium text-white/55">{s.feed}</span>
                                {" — "}
                                {s.signal}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contradicting signals */}
                    {c.contradicting.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-red-400/60">
                          Contradicting
                        </p>
                        <div className="space-y-1">
                          {c.contradicting.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 text-[10px]">
                              <span className="mt-0.5 shrink-0 text-red-400/70">✕</span>
                              <span className="text-white/40">
                                <span className="font-medium text-white/55">{s.feed}</span>
                                {" — "}
                                {s.signal}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
