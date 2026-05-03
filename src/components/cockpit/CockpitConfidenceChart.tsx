import type { CockpitConfidencePoint } from "@/types/cockpit";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { formatMonthDay } from "@/lib/formatDate";

type Props = {
  headline: string;
  series: CockpitConfidencePoint[];
};

export function CockpitConfidenceChart({ headline, series }: Props) {
  const w = 320;
  const h = 128;
  const padX = 14;
  const padY = 14;
  const vals = series.map((p) => p.value);
  const minV = Math.min(...vals) - 0.03;
  const maxV = Math.max(...vals) + 0.03;
  const span = maxV - minV || 1;

  const points = series.map((p, i) => {
    const x =
      padX + (i / Math.max(series.length - 1, 1)) * (w - padX * 2);
    const y =
      padY + (1 - (p.value - minV) / span) * (h - padY * 2);
    return { x, y, ...p };
  });

  const lineD = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ");
  const areaD = `${lineD} L ${points[points.length - 1]?.x ?? 0} ${h - padY} L ${points[0]?.x ?? 0} ${h - padY} Z`;

  return (
    <GlassPanel className="p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-tos-dim">
        Conviction over time
      </p>
      <p className="mt-2 text-sm leading-relaxed text-tos-muted">{headline}</p>

      <div className="tos-inset-panel relative mt-5 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-tos-warm/[0.05] to-transparent"
          aria-hidden
        />
        <div className="relative overflow-x-auto tos-nav-scroll px-1 py-2">
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="mx-auto block max-w-full"
            role="img"
            aria-label="Assistant conviction over recent sessions"
          >
            <defs>
              <linearGradient
                id="cockpitConfFill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="rgba(45,212,191,0.22)" />
                <stop offset="70%" stopColor="rgba(45,212,191,0.06)" />
                <stop offset="100%" stopColor="rgba(45,212,191,0)" />
              </linearGradient>
              <linearGradient id="cockpitConfStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(45,212,191,0.45)" />
                <stop offset="100%" stopColor="rgba(45,212,191,0.9)" />
              </linearGradient>
            </defs>
            {[0.33, 0.66].map((r) => {
              const y = padY + r * (h - padY * 2);
              return (
                <line
                  key={r}
                  x1={padX}
                  y1={y}
                  x2={w - padX}
                  y2={y}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={1}
                />
              );
            })}
            <path d={areaD} fill="url(#cockpitConfFill)" />
            <path
              d={lineD}
              fill="none"
              stroke="url(#cockpitConfStroke)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((pt) => (
              <circle
                key={pt.at}
                cx={pt.x}
                cy={pt.y}
                r={3.5}
                fill="var(--tos-bg-base)"
                stroke="var(--tos-accent-warm)"
                strokeWidth={1.5}
              />
            ))}
          </svg>
        </div>
      </div>
      <div className="mt-3 flex justify-between text-[10px] tabular-nums tracking-wide text-tos-dim">
        <span>
          {series[0] ? formatMonthDay(series[0].at) : "—"}
        </span>
        <span className="text-tos-muted">Today</span>
      </div>
    </GlassPanel>
  );
}
