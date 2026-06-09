"use client";

/**
 * AXE Memory Brain — shows AXE's accumulated knowledge about the trader.
 * Used on the settings page to display and manage memories.
 */

import { useCallback, useEffect, useState } from "react";
import { Brain, Trash2, RefreshCw } from "lucide-react";

type Memory = {
  id: string;
  memory_type: string;
  content: string;
  symbol: string | null;
  confidence: number;
  source: string;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  observation: { label: "Observation", color: "text-cyan-300 border-cyan-400/20 bg-cyan-400/[0.06]", icon: "👁" },
  pattern: { label: "Pattern", color: "text-amber-200 border-amber-300/20 bg-amber-300/[0.06]", icon: "🔄" },
  preference: { label: "Preference", color: "text-emerald-300 border-emerald-400/20 bg-emerald-400/[0.06]", icon: "⭐" },
  weakness: { label: "Weakness", color: "text-red-300 border-red-400/20 bg-red-400/[0.06]", icon: "⚠️" },
  strength: { label: "Strength", color: "text-emerald-300 border-emerald-400/20 bg-emerald-400/[0.06]", icon: "💪" },
  rule: { label: "Rule", color: "text-white/70 border-white/10 bg-white/[0.04]", icon: "📏" },
  context: { label: "Context", color: "text-white/50 border-white/[0.08] bg-white/[0.03]", icon: "📌" },
};

export function MemoryBrain() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/axe-memory");
      const json = (await res.json()) as { ok: boolean; memories?: Memory[] };
      if (json.ok) setMemories(json.memories ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await fetch("/api/axe-memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      /* silent */
    } finally {
      setDeleting(null);
    }
  }, []);

  // Group by type
  const grouped = new Map<string, Memory[]>();
  for (const m of memories) {
    const list = grouped.get(m.memory_type) ?? [];
    list.push(m);
    grouped.set(m.memory_type, list);
  }

  const typeOrder = ["weakness", "pattern", "strength", "rule", "preference", "observation", "context"];
  const sortedGroups = [...grouped.entries()].sort(
    (a, b) => (typeOrder.indexOf(a[0]) ?? 99) - (typeOrder.indexOf(b[0]) ?? 99),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Brain size={16} className="text-cyan-400" />
          <h2 className="text-[14px] font-semibold text-white/90">AXE Memory</h2>
          <span className="text-[11px] text-white/30">{memories.length} memories</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/40 transition-colors hover:text-cyan-300 disabled:opacity-30"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && memories.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/50"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && memories.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center">
          <Brain size={24} className="mx-auto mb-2 text-white/20" />
          <p className="text-[12px] text-white/40">
            No memories yet. AXE learns about you through conversations.
          </p>
          <p className="mt-1 text-[11px] text-white/25">
            Start chatting and AXE will remember your patterns, preferences, and rules.
          </p>
        </div>
      )}

      {sortedGroups.map(([type, mems]) => {
        const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.observation;
        return (
          <div key={type} className="space-y-1.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[12px]">{config.icon}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                {config.label}s
              </span>
              <span className="text-[9px] text-white/20">{mems.length}</span>
            </div>

            {mems.map((m) => (
              <div
                key={m.id}
                className="group flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 transition-colors hover:border-white/[0.08]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] leading-relaxed text-white/60">{m.content}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {m.symbol && (
                      <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.04] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-cyan-300/60">
                        {m.symbol}
                      </span>
                    )}
                    <span className="text-[9px] text-white/20">
                      {Math.round(m.confidence * 100)}% confidence
                    </span>
                    <span className="text-[9px] text-white/15">
                      {new Date(m.created_at).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => remove(m.id)}
                  disabled={deleting === m.id}
                  className="shrink-0 rounded-lg p-1.5 text-white/15 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100 disabled:opacity-30"
                  title="Remove memory"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
