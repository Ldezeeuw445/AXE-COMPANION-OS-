import type { CockpitBehaviorMap as BehaviorType } from "@/types/cockpit";
import { GlassPanel } from "@/components/ui/GlassPanel";

type Props = {
  data: BehaviorType;
};

export function CockpitBehaviorMap({ data }: Props) {
  return (
    <GlassPanel className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
        Behavior map
      </p>
      <p className="mt-2 text-sm leading-relaxed text-tos-muted">
        Where your attention actually lives — not what markets traded loudest.
      </p>

      <div className="mt-6 space-y-6">
        <section className="tos-inset-panel p-4">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--icon-cockpit)]">
            Sessions
          </h3>
          <ul className="mt-3 space-y-4">
            {data.sessions.map((s) => (
              <li key={s.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-tos-text">
                    {s.label}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-tos-muted">
                    {Math.round(s.weight * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-tos-warm/40 to-tos-warm/85"
                    style={{ width: `${s.weight * 100}%` }}
                  />
                </div>
                {s.note ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-tos-dim">
                    {s.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="tos-inset-panel p-4">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-tos-price">
            Instruments
          </h3>
          <ul className="mt-3 divide-y divide-white/[0.05]">
            {data.preferredAssets.map((a) => (
              <li
                key={a.symbol}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-semibold text-tos-text">
                    {a.symbol}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-tos-dim">
                    {a.context}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-tos-price/90">
                  {Math.round(a.weight * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="tos-inset-panel p-4">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-tos-actions">
            Edge patterns
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-tos-dim">
            Strength is how often these showed up in approved ideas — not win
            rate.
          </p>
          <ul className="mt-4 space-y-3">
            {data.patternTendencies.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[12px] leading-snug text-tos-muted">
                  {p.label}
                </span>
                <div className="flex w-[6.5rem] shrink-0 items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[color:var(--icon-actions)]/85"
                      style={{ width: `${p.strength}%` }}
                    />
                  </div>
                  <span className="w-7 text-right font-mono text-[10px] tabular-nums text-tos-dim">
                    {p.strength}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </GlassPanel>
  );
}
