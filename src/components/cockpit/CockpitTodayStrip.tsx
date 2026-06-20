"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CockpitTodaySummary, CockpitTraderScores } from "@/types/cockpit";

function todayUtcStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function scoreTone(score: number, available: boolean): string {
  if (!available) return "text-white/35";
  if (score >= 75) return "text-emerald-300";
  if (score >= 60) return "text-cyan-300";
  if (score >= 45) return "text-amber-200";
  return "text-orange-300";
}

function ringOffset(score: number, radius = 12): number {
  const circumference = 2 * Math.PI * radius;
  return circumference - (score / 100) * circumference;
}

type Props = {
  initial: CockpitTodaySummary;
  traderScores?: CockpitTraderScores | null;
};

export function CockpitTodayStrip({ initial, traderScores = null }: Props) {
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

  const scrollScores =
    traderScores?.scores.filter((item) => item.key !== "alignment") ?? [];

  return (
    <div className="tos-matte-banner flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
      </div>

      {scrollScores.length > 0 ? (
        <div className="relative min-w-0">
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[#0c0c0e] to-transparent" />
          <div className="tos-scrollbar flex gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
            {scrollScores.map((item) => (
              <div
                key={item.key}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0a0a0d]/80 px-2.5 py-1.5"
                title={item.hint}
              >
                <div className="relative h-8 w-8 shrink-0">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 32 32" aria-hidden>
                    <circle
                      cx="16"
                      cy="16"
                      r="12"
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="16"
                      cy="16"
                      r="12"
                      fill="none"
                      stroke={item.available ? "var(--tos-alignment-ring)" : "rgba(255,255,255,0.08)"}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 12}
                      strokeDashoffset={item.available ? ringOffset(item.score, 12) : 2 * Math.PI * 12}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className={`text-[10px] font-bold tabular-nums ${scoreTone(item.score, item.available)}`}
                    >
                      {item.available ? Math.round(item.score) : "—"}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/78">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Hidden anchor so refresh can re-query after snapshot */}
      <span className="sr-only" data-since={todayUtcStartIso()} />
    </div>
  );
}
