import type { CockpitLearningMilestone } from "@/types/cockpit";
import { GlassPanel } from "@/components/ui/GlassPanel";

type Props = {
  headline: string;
  milestones: CockpitLearningMilestone[];
};

export function CockpitLearningProgress({ headline, milestones }: Props) {
  return (
    <GlassPanel className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
        Learning arc
      </p>
      <p className="mt-2 text-sm leading-relaxed text-tos-muted">{headline}</p>

      <ol className="relative mt-6 space-y-6">
        <div
          className="absolute left-[0.4rem] top-2 bottom-6 w-px bg-gradient-to-b from-tos-warm/30 via-white/10 to-transparent"
          aria-hidden
        />
        {milestones.map((m) => (
          <li key={m.id} className="relative pl-8">
            <span
              className="absolute left-0 top-2 h-2.5 w-2.5 rounded-full border-2 border-tos-warm/60 bg-tos-bg"
              aria-hidden
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="text-[13px] font-medium leading-tight text-tos-text">
                {m.label}
              </span>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-tos-warm/90">
                {m.periodLabel}
              </span>
            </div>
            <div
              className="mt-3 h-[5px] overflow-hidden rounded-full bg-white/[0.05]"
              role="progressbar"
              aria-valuenow={m.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${m.label} progress`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-tos-warm/35 via-tos-warm/90 to-tos-warm/70 transition-all duration-500"
                style={{ width: `${m.progress}%` }}
              />
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-tos-muted">
              {m.narrative}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-tos-border/80 pt-4 text-[11px] leading-relaxed text-tos-dim">
        The line is your evolution, not a leaderboard — slower milestones are
        where the assistant is still listening.
      </p>
    </GlassPanel>
  );
}
