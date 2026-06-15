import type { CockpitFeedbackImpact as FeedbackType } from "@/types/cockpit";
import { GlassPanel } from "@/components/ui/GlassPanel";

type Props = {
  data: FeedbackType;
};

export function CockpitFeedbackImpact({ data }: Props) {
  const total = data.acceptedSetups + data.rejectedSetups || 1;
  const acceptPct = (data.acceptedSetups / total) * 100;
  const rejectPct = (data.rejectedSetups / total) * 100;
  const maxCorr = Math.max(...data.last28dTrend.map((w) => w.corrections), 1);

  return (
    <GlassPanel className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
        What you taught it
      </p>
      <p className="mt-2 text-sm leading-relaxed text-tos-muted">
        Approvals aren’t “wins”; rejects and corrections are the sharper signal —
        especially when you fix the reasoning, not just the level.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="tos-inset-panel px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-tos-dim">
            Kept
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-tos-long">
            {data.acceptedSetups}
          </p>
          <p className="mt-0.5 text-[10px] text-tos-dim">setups you endorsed</p>
        </div>
        <div className="tos-inset-panel px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-tos-dim">
            Passed
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-tos-short">
            {data.rejectedSetups}
          </p>
          <p className="mt-0.5 text-[10px] text-tos-dim">setups you declined</p>
        </div>
      </div>

      <div
        className="mt-4 flex h-[6px] overflow-hidden rounded-full bg-white/[0.05]"
        role="meter"
        aria-valuenow={acceptPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Accepted versus declined setups"
      >
        <div
          className="h-full rounded-l-full bg-gradient-to-r from-tos-long/70 to-tos-long"
          style={{ width: `${acceptPct}%` }}
        />
        <div
          className="h-full bg-white/[0.08]"
          style={{ width: `${rejectPct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-tos-dim">
        <span className="text-tos-long/90">{acceptPct.toFixed(0)}% kept</span>
        <span className="text-tos-short/80">
          {rejectPct.toFixed(0)}% passed
        </span>
      </div>

      <div className="mt-6 border-t border-tos-border/80 pt-5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-tos-dim">
              Reasoning fixes
            </p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-tos-text">
              {data.correctionsCount}
            </p>
          </div>
          <p className="max-w-[12rem] text-right text-[11px] leading-snug text-tos-muted">
            Worth roughly{" "}
            <span className="font-medium text-[color:var(--icon-cockpit)]">
              +{data.correctionLiftPercent}%
            </span>{" "}
            to alignment — from tightening how stops are described, not luck.
          </p>
        </div>
        {data.last28dTrend.length > 0 ? (
          <>
            <p className="mt-4 text-[10px] uppercase tracking-wider text-tos-dim">
              Four-week correction rhythm
            </p>
            <div className="mt-2 flex h-12 items-end gap-2">
              {data.last28dTrend.map((w) => (
                <div key={w.weekLabel} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div
                    className="flex w-full max-w-[2.75rem] flex-1 items-end justify-center"
                    title={`${w.corrections} fixes`}
                  >
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-tos-warm/15 to-tos-warm/75"
                      style={{
                        height: `${Math.max((w.corrections / maxCorr) * 100, 12)}%`,
                      }}
                    />
                  </div>
                  <span className="max-w-full truncate text-center text-[9px] leading-tight text-tos-dim">
                    {w.weekLabel}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
              Spikes usually follow macro weeks or when you tighten how stops and invalidations are described.
            </p>
          </>
        ) : (
          <p className="mt-4 text-[11px] leading-relaxed text-tos-dim">
            Correction rhythm appears after journal tags or chat corrections build up over a few weeks.
          </p>
        )}
      </div>
    </GlassPanel>
  );
}
