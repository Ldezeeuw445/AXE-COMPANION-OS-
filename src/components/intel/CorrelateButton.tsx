"use client";

/**
 * CorrelateButton — "Make Intel Correlation" quick action.
 *
 * Calls /api/intel-correlate to run GPT-4o cross-feed analysis,
 * then displays the correlation result inline with a "Save to Vault" button.
 */

import { useState, useCallback } from "react";
import { Sparkles, Save, Loader2 } from "lucide-react";

type Correlation = {
  id: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  signal: string | null;
  feedsUsed: string[];
  symbols: string[];
};

export function CorrelateButton({ symbol }: { symbol?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Correlation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCorrelation = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);

    try {
      const res = await fetch("/api/intel-correlate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol ?? undefined }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        setError(body.error ?? `Error ${res.status}`);
        return;
      }

      const data = await res.json();
      if (data.ok && data.correlation) {
        setResult(data.correlation);
      } else {
        setError(data.error ?? "No correlation found");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [loading, symbol]);

  const saveToVault = useCallback(async () => {
    if (!result || saving) return;
    setSaving(true);

    try {
      const res = await fetch("/api/vault/save-axe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Intel Correlation: ${result.title}`,
          content: `## ${result.title}\n\n**Confidence:** ${result.confidence}\n**Signal:** ${result.signal ?? "none"}\n**Feeds:** ${result.feedsUsed.join(", ")}\n**Symbols:** ${result.symbols.join(", ")}\n\n${result.summary}`,
          symbol: result.symbols[0] ?? symbol ?? null,
        }),
      });

      if (res.ok) {
        setSaved(true);
      }
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  }, [result, saving, symbol]);

  const confidenceColor =
    result?.confidence === "high"
      ? "text-emerald-300"
      : result?.confidence === "medium"
        ? "text-amber-200/90"
        : "text-rose-300/80";

  return (
    <div id="correlate" className="space-y-3">
      {/* Button */}
      <button
        onClick={runCorrelation}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#00d4f5]/20 bg-[#00d4f5]/[0.06] px-4 py-3 text-[13px] font-semibold text-[#00d4f5] transition-all hover:bg-[#00d4f5]/[0.10] active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing cross-feed correlations...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Make Intel Correlation
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3">
          <p className="text-[12px] text-rose-200/80">⚠️ {error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-[#00d4f5]/15 bg-[#00d4f5]/[0.03] px-4 py-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="text-[13px] font-bold text-white">{result.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${confidenceColor}`}>
                  {result.confidence} confidence
                </span>
                {result.signal && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    result.signal.toLowerCase().includes("bull")
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                      : result.signal.toLowerCase().includes("bear")
                        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                        : "border-white/10 bg-white/5 text-white/70"
                  }`}>
                    {result.signal}
                  </span>
                )}
              </div>
            </div>

            {/* Save to Vault */}
            <button
              onClick={saveToVault}
              disabled={saving || saved}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
                saved
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              <Save className="h-3 w-3" />
              {saved ? "Saved" : saving ? "Saving..." : "Save to Vault"}
            </button>
          </div>

          {/* Feeds used */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {result.feedsUsed.map((feed) => (
              <span
                key={feed}
                className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-tos-dim"
              >
                {feed}
              </span>
            ))}
          </div>

          {/* Summary */}
          <p className="mt-3 text-[12px] leading-[1.7] text-white/80">
            {result.summary}
          </p>

          {/* Symbols */}
          {result.symbols.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {result.symbols.map((sym) => (
                <span
                  key={sym}
                  className="rounded-full border border-[#00d4f5]/20 bg-[#00d4f5]/[0.06] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#00d4f5]/80"
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
}
