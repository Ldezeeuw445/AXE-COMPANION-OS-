import type { CockpitTraderScores } from "@/types/cockpit";
import { GlassPanel } from "@/components/ui/GlassPanel";

type Props = {
  data: CockpitTraderScores;
};

function scoreTone(score: number, available: boolean): string {
  if (!available) return "text-tos-dim";
  if (score >= 75) return "text-emerald-300";
  if (score >= 60) return "text-cyan-300";
  if (score >= 45) return "text-amber-200";
  return "text-orange-300";
}

function ringOffset(score: number): number {
  const circumference = 2 * Math.PI * 18;
  return circumference - (score / 100) * circumference;
}

export function CockpitScoreGrid({ data }: Props) {
  const availableCount = data.scores.filter((s) => s.available).length;

  return (
    <GlassPanel className="p-4" glow="none">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
            Trader scores
          </p>
          <p className="mt-1 text-xs leading-relaxed text-tos-muted">
            Per-user rollup from AXE journal breakdowns, trade labels, and execution history — last{" "}
            {data.periodDays} days.
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-tos-dim">
          {availableCount}/5 live · {data.tradeCount} closes
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.scores.map((item) => (
          <div
            key={item.key}
            className="flex flex-col items-center rounded-xl border border-white/[0.06] bg-[#0a0a0d]/80 px-3 py-4"
          >
            <div className="relative h-12 w-12 shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 44 44" aria-hidden>
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="4"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke={item.available ? "var(--tos-alignment-ring)" : "rgba(255,255,255,0.08)"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 18}
                  strokeDashoffset={item.available ? ringOffset(item.score) : 2 * Math.PI * 18}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`text-sm font-bold tabular-nums ${scoreTone(item.score, item.available)}`}
                >
                  {item.available ? item.score : "—"}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-tos-text">
              {item.label}
            </p>
            <p className="mt-1 line-clamp-2 text-center text-[9px] leading-snug text-tos-dim">
              {item.hint}
            </p>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
