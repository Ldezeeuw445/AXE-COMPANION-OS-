import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { MarketingStatusBar } from "@/components/marketing/MarketingStatusBar";
import { marketingPerformance } from "@/services/mock/marketingVisualData";

export function MarketingStatsScreen() {
  const p = marketingPerformance;
  const maxAbsR = Math.max(...p.weeklyR.map((r) => Math.abs(r)), 0.01);

  return (
    <div className="flex h-[780px] flex-col bg-tos-bg">
      <MarketingStatusBar />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6">
        <header className="pt-1">
          <h2 className="text-base font-bold tracking-tight text-tos-text">
            Performance
          </h2>
          <p className="mt-0.5 text-[12px] text-tos-muted">{p.note}</p>
        </header>

        <GlassPanel glow="warm" className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
            Alignment fit
          </p>
          <div className="mt-4 flex items-center gap-5">
            <div className="relative h-[5.5rem] w-[5.5rem] shrink-0">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
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
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - p.alignment / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums text-tos-text">
                  {p.alignment}
                </span>
                <span className="text-[8px] uppercase tracking-wider text-tos-dim">
                  / 100
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Badge
                variant={p.alignmentDelta >= 0 ? "long" : "short"}
              >
                {p.alignmentDelta >= 0 ? "+" : ""}
                {p.alignmentDelta} pts
              </Badge>
              <p className="text-[12px] leading-relaxed text-tos-muted">
                Post-CPI corrections on invalidation language — fewer mismatches
                vs your 5m close rule.
              </p>
            </div>
          </div>
        </GlassPanel>

        <div className="grid grid-cols-2 gap-2.5">
          <GlassPanel className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Kept setups
            </p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-tos-long">
              {p.keptRate}%
            </p>
            <p className="text-[10px] text-tos-dim">{p.setupsReviewed} reviewed</p>
          </GlassPanel>
          <GlassPanel className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Avg R (30d)
            </p>
            <p
              className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                p.avgR30d > 0
                  ? "text-tos-long"
                  : p.avgR30d < 0
                    ? "text-tos-short"
                    : "text-tos-text"
              }`}
            >
              {p.avgR30d >= 0 ? "+" : ""}
              {p.avgR30d.toFixed(2)}R
            </p>
            <p className="text-[10px] text-tos-dim">paper fills</p>
          </GlassPanel>
          <GlassPanel className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Max DD
            </p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-tos-risk">
              {p.maxDd30dPct}%
            </p>
            <p className="text-[10px] text-tos-dim">30-day peak</p>
          </GlassPanel>
          <GlassPanel className="p-3.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-tos-dim">
              Stability
            </p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-tos-text">
              {p.sharpeLike.toFixed(2)}
            </p>
            <p className="text-[10px] text-tos-dim">vol-adjusted</p>
          </GlassPanel>
        </div>

        <GlassPanel className="flex-1 p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
            Weekly R (paper)
          </p>
          <div className="mt-3 flex h-24 items-end gap-2">
            {p.weeklyR.map((r, i) => (
              <div key={p.weekLabels[i]} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-16 w-full items-end justify-center">
                  <div
                    className={`w-[70%] max-w-[2rem] rounded-t-md ${
                      r >= 0
                        ? "bg-gradient-to-t from-tos-warm/15 to-tos-warm/80"
                        : "bg-gradient-to-t from-white/10 to-white/25"
                    } shadow-[0_0_14px_rgba(201,162,39,0.12)]`}
                    style={{ height: `${(Math.abs(r) / maxAbsR) * 100}%`, minHeight: "10%" }}
                  />
                </div>
                <span className="text-[9px] font-mono text-tos-dim">{p.weekLabels[i]}</span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    r >= 0 ? "text-tos-warm" : "text-tos-muted"
                  }`}
                >
                  {r >= 0 ? "+" : ""}
                  {r.toFixed(1)}R
                </span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
