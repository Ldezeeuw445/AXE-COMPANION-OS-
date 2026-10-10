import { AlertTriangle, Lightbulb } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { WeakSpot } from "@/lib/journal/weakSpots";

type Props = {
  weakSpots: WeakSpot[];
};

/**
 * What AXE noticed on its own.
 *
 * Deliberately not a chart. The point is a sentence a trader can act on this
 * afternoon, with the measurement that produced it in plain sight — so it reads
 * as an observation to argue with, not a verdict handed down.
 *
 * Renders nothing when there is nothing to say. Silence after a clean month is
 * information too, and inventing a weakness to fill the panel would make every
 * real one worth less.
 */
export function WeakSpotsPanel({ weakSpots }: Props) {
  if (weakSpots.length === 0) return null;

  return (
    <GlassPanel className="!p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400/90" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/90">
          What AXE noticed
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {weakSpots.map((spot) => {
          const severe = spot.severity >= 0.66;
          return (
            <li
              key={spot.id}
              className={`rounded-xl border px-3 py-3 ${
                severe
                  ? "border-rose-400/20 bg-rose-500/[0.06]"
                  : "border-white/[0.07] bg-[#0a0a0d]/90"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-semibold leading-snug text-tos-text">{spot.title}</p>
                <span className="shrink-0 pt-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-tos-dim">
                  {spot.sampleSize} trades
                </span>
              </div>

              <p className="mt-1.5 text-[12px] leading-relaxed text-tos-muted">{spot.evidence}</p>

              <div className="mt-2.5 flex items-start gap-2 border-t border-white/[0.06] pt-2.5">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400/80" />
                <p className="text-[12px] leading-relaxed text-cyan-100/80">{spot.proposal}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
