import { Brain, TrendingUp } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { stageProgress, type LearningStage } from "@/lib/axe/learningStage";

type Props = {
  arc: LearningStage;
  /** "AXE" or "AXE Intel" — the two learn different things and grow apart. */
  label?: string;
  accentClassName?: string;
};

/**
 * What AXE has learned about you, and whether that is still moving.
 *
 * The bar is backed by countable things — remembered facts, scored trades,
 * your own rules and playbooks — so it only moves when something real
 * happened. It can sit still for a week, and it should: a number that always
 * goes up teaches a trader to stop looking at it.
 */
export function LearningArcPanel({ arc, label = "AXE", accentClassName = "text-tos-gold" }: Props) {
  const progress = Math.round(stageProgress(arc) * 100);
  const atTop = arc.pointsForNextStage === null;

  return (
    <GlassPanel className="!p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className={`h-3.5 w-3.5 ${accentClassName}`} />
          <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${accentClassName}`}>
            {label} learning arc
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-tos-dim">
          {atTop ? "Top stage" : `Stage ${arc.stage + 1} of 5`}
        </span>
      </div>

      <p className="mt-2.5 text-[14px] font-semibold text-tos-text">{arc.name}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-tos-muted">{arc.summary}</p>

      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-tos-gold/60 to-tos-gold transition-[width] duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-tos-dim">
          {atTop
            ? `${arc.points} points — everything AXE knows about you`
            : `${arc.points} of ${arc.pointsForNextStage} points to the next stage`}
        </p>
      </div>

      {arc.growth?.summary ? (
        <div className="mt-3 flex items-start gap-2 border-t border-white/[0.06] pt-2.5">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/90" />
          <p className="text-[12px] leading-relaxed text-emerald-100/85">{arc.growth.summary}</p>
        </div>
      ) : arc.growth ? (
        // Saying "nothing changed" out loud is the point: it keeps the months
        // where something did change meaningful.
        <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[12px] text-tos-dim">
          Nothing new this month — AXE learns from closed trades and from rules you write down.
        </p>
      ) : null}

      {arc.nextStep ? (
        <p className="mt-2.5 text-[12px] leading-relaxed text-cyan-100/80">{arc.nextStep}</p>
      ) : null}
    </GlassPanel>
  );
}
