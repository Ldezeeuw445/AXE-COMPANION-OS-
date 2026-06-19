"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CockpitTodaySummary } from "@/types/cockpit";

function todayUtcStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function CockpitTodayStrip({ initial }: { initial: CockpitTodaySummary }) {
  const [summary, setSummary] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/cockpit/today", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { today?: CockpitTodaySummary };
      if (json.today) setSummary(json.today);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="tos-matte-banner flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="tos-accent-dot tos-accent-dot--cyan shrink-0" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
          Today · {dateLabel}
        </span>
        <span className="text-[11px] text-white/55">
          Alignment{" "}
          <span className="font-mono font-semibold text-white/85">{summary.alignmentScore}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
        <span>
          Chat <span className="font-mono text-white/75">{summary.chatMessages}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          Trades <span className="font-mono text-white/75">{summary.tradesClosed}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          Feed <span className="font-mono text-white/75">{summary.feedEvents}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          Journal <span className="font-mono text-white/75">{summary.journalNotes}</span>
        </span>
        <Link href="/feed" className="ml-1 font-semibold text-cyan-400/85 hover:text-cyan-300">
          Feed →
        </Link>
      </div>
      {/* Hidden anchor so refresh can re-query after snapshot */}
      <span className="sr-only" data-since={todayUtcStartIso()} />
    </div>
  );
}
