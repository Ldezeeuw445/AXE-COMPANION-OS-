"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CockpitTodaySummary, CockpitTraderScores } from "@/types/cockpit";

const OVERALL_RING = "#67e8f9";

function todayUtcStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function ringOffset(score: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  return circumference - (score / 100) * circumference;
}

function ScoreChip({
  label,
  score,
  available,
  hint,
}: {
  label: string;
  score: number;
  available: boolean;
  hint: string;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-xl border border-white/[0.06] bg-[#0a0a0d]/80 px-2 py-2"
      title={hint}
    >
      <div className="relative h-9 w-9 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke={available ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 14}
            strokeDashoffset={available ? ringOffset(score, 14) : 2 * Math.PI * 14}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold tabular-nums text-white">
            {available ? Math.round(score) : "—"}
          </span>
        </div>
      </div>
      <span className="mt-1.5 text-center text-[8px] font-semibold uppercase tracking-[0.1em] text-white/75">
        {label}
      </span>
    </div>
  );
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

  const pillarScores = traderScores?.scores ?? [];
  const overallAlignment = traderScores?.overallAlignment ?? summary.alignmentScore;
  const overallAvailable = traderScores?.overallAlignment != null;

  return (
    <div className="tos-matte-banner flex flex-col gap-3 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="tos-accent-dot tos-accent-dot--cyan shrink-0" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
            Today · {dateLabel}
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

      {pillarScores.length > 0 ? (
        <div className="flex items-stretch gap-2.5">
          <div
            className="flex w-[6.25rem] shrink-0 flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 px-2 py-3"
            title={`Overall alignment — average of Discipline, Execution, Risk and Patience (last ${traderScores?.periodDays ?? 90} days).`}
          >
            <div className="relative h-[4.5rem] w-[4.5rem] shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 72 72" aria-hidden>
                <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                <circle
                  cx="36"
                  cy="36"
                  r="28"
                  fill="none"
                  stroke={overallAvailable ? OVERALL_RING : "rgba(255,255,255,0.08)"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 28}
                  strokeDashoffset={
                    overallAvailable ? ringOffset(overallAlignment, 28) : 2 * Math.PI * 28
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums leading-none text-cyan-300">
                  {overallAvailable ? Math.round(overallAlignment) : "—"}
                </span>
              </div>
            </div>
            <span className="mt-2 text-center text-[8px] font-semibold uppercase leading-tight tracking-[0.12em] text-white/82">
              Overall
              <br />
              Alignment
            </span>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            {pillarScores.map((item) => (
              <ScoreChip
                key={item.key}
                label={item.label}
                score={item.score}
                available={item.available}
                hint={item.hint}
              />
            ))}
          </div>
        </div>
      ) : null}

      <span className="sr-only" data-since={todayUtcStartIso()} />
    </div>
  );
}
