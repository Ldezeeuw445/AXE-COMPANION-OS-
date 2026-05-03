import type { CockpitAlignment as CockpitAlignmentType } from "@/types/cockpit";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { formatWeekdayMonthDayTime } from "@/lib/formatDate";

type Props = {
  data: CockpitAlignmentType;
};

export function CockpitAlignment({ data }: Props) {
  const { score, capturedAt, deltaFromPrior } = data;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;

  return (
    <GlassPanel glow="warm" className="relative overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-[color:var(--tos-alignment-ring)]/[0.08] blur-2xl"
        aria-hidden
      />
      <div className="relative">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
          Alignment
        </p>
        <p className="mt-2 text-sm leading-snug text-tos-text">
          How often the assistant’s proposals feel like{" "}
          <span className="text-tos-muted">your</span> book — not a generic
          playbook.
        </p>
        <div className="mt-6 flex items-center gap-6">
          <div className="relative h-[7.25rem] w-[7.25rem] shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="7"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="var(--tos-alignment-ring)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-[stroke-dashoffset] duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[1.65rem] font-bold tracking-tight text-tos-text tabular-nums">
                {score}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-tos-dim">
                fit · 100
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-tos-dim">
                Since last snapshot
              </p>
              <p
                className={`mt-1 text-base font-medium tabular-nums ${
                  deltaFromPrior > 0
                    ? "text-tos-long"
                    : deltaFromPrior < 0
                      ? "text-tos-short"
                      : "text-tos-text"
                }`}
              >
                {deltaFromPrior >= 0 ? "+" : ""}
                {deltaFromPrior}
                <span className="text-sm font-normal text-tos-muted"> pts</span>
              </p>
            </div>
            <p className="text-[11px] leading-relaxed text-tos-muted">
              Creeping up after you corrected invalidation wording through CPI
              week — small moves, honest ones.
            </p>
            <time
              className="block text-[10px] tabular-nums tracking-wide text-tos-dim"
              dateTime={capturedAt}
            >
              {formatWeekdayMonthDayTime(capturedAt)}
            </time>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
