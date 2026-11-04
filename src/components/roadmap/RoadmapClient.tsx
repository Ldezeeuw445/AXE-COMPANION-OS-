"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import type { RoadmapItemRow } from "@/lib/roadmap/eligibility";

export function RoadmapClient() {
  const [items, setItems] = useState<RoadmapItemRow[]>([]);
  const [canVote, setCanVote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap");
      const json = (await res.json()) as {
        error?: string;
        canVote?: boolean;
        items?: RoadmapItemRow[];
      };
      if (!res.ok) {
        setError(json.error ?? "Could not load roadmap.");
        return;
      }
      setCanVote(Boolean(json.canVote));
      setItems(json.items ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleVote(item: RoadmapItemRow) {
    if (!canVote) return;
    const res = await fetch("/api/roadmap/vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id, remove: Boolean(item.voted_by_me) }),
    });
    if (res.ok) void load();
  }

  if (loading) {
    return <p className="text-xs text-tos-dim">Loading roadmap…</p>;
  }
  if (error) {
    return <p className="text-xs text-rose-300">{error}</p>;
  }

  return (
    <div className="space-y-3">
      {!canVote ? (
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-tos-dim">
          Roadmap voting is a Founder benefit.{" "}
          <Link href="/upgrade" className="text-tos-muted underline-offset-2 hover:underline">
            See plans
          </Link>
          .
        </p>
      ) : (
        <p className="text-[11px] text-tos-dim">One vote per item. Tap again to remove.</p>
      )}
      {items.map((item) => (
        <GlassPanel key={item.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-tos-text">{item.title}</h3>
              <p className="mt-1 text-xs text-tos-muted">{item.description}</p>
            </div>
            <Badge variant="neutral">{item.status.replace("_", " ")}</Badge>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-tos-dim">{item.vote_count ?? 0} votes</span>
            <button
              type="button"
              disabled={!canVote}
              onClick={() => void toggleVote(item)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                item.voted_by_me
                  ? "border border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border border-white/10 bg-white/[0.05] text-white/85 disabled:opacity-40"
              }`}
            >
              {item.voted_by_me ? "Voted" : "Vote"}
            </button>
          </div>
        </GlassPanel>
      ))}
      {items.length === 0 ? (
        <p className="text-xs text-tos-dim">No roadmap items yet — check back soon.</p>
      ) : null}
    </div>
  );
}
