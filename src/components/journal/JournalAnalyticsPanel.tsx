import type { ReactNode } from "react";
import type { JournalAnalytics } from "@/lib/journal/computeJournalAnalytics";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Hash, AlertTriangle, TrendingUp, Zap, Target, BarChart3 } from "lucide-react";

type Props = {
  analytics: JournalAnalytics;
};

function fmtPct(n: number) {
  return `${Math.round(n)}%`;
}

function fmtPnl(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

export function JournalAnalyticsPanel({ analytics }: Props) {
  const a = analytics;
  const taggedSample = a.journaledWithTagCount;
  if (a.totalTrades < 3 || taggedSample < 3) {
    return (
      <GlassPanel className="!p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tos-dim">
          Journal analytics
        </p>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#0a0a0d]/90 px-3 py-3">
          <p className="text-sm font-medium text-tos-text">Not enough tagged trades yet</p>
          <p className="mt-1 text-xs leading-relaxed text-tos-muted">
            AXE needs a minimum tagged trade sample before showing analytics. Current sample: {taggedSample} tagged of{" "}
            {a.totalTrades} closed trades.
          </p>
        </div>
      </GlassPanel>
    );
  }
  return (
    <GlassPanel className="!p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tos-dim">
        Journal analytics
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <MetricCard
          icon={<Hash className="h-4 w-4 text-emerald-400" aria-hidden />}
          label="Top tag (all time)"
          value={a.topTagAllTime ? `${a.topTagAllTime} (${a.topTagAllTimeCount})` : "—"}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4 text-rose-400" aria-hidden />}
          label="Most common losing tag"
          value={a.mostCommonLosingTag ?? "—"}
        />
        <MetricCard
          icon={<TrendingUp className="h-4 w-4 text-sky-400" aria-hidden />}
          label="Best-performing tag (avg PnL)"
          value={
            a.bestPerformingTag
              ? `${a.bestPerformingTag} · ${fmtPnl(a.bestPerformingTagAvgPnl)}`
              : "—"
          }
        />
        <MetricCard
          icon={<Zap className="h-4 w-4 text-amber-300" aria-hidden />}
          label="Avg PnL when Impatient"
          value={
            a.impatientCount > 0 ? `${fmtPnl(a.avgPnlWhenImpatient)} (n=${a.impatientCount})` : "—"
          }
        />
        <MetricCard
          icon={<Target className="h-4 w-4 text-orange-400" aria-hidden />}
          label="Completion per account"
          value={`${a.journaledWithTagCount} of ${a.totalTrades} closed trades have a preset tag`}
          highlight={fmtPct(a.completionPct)}
        />
        <MetricCard
          icon={<BarChart3 className="h-4 w-4 text-tos-muted" aria-hidden />}
          label="Tag distribution"
          value={a.tagDistribution
            .filter((x) => x.count > 0)
            .map((x) => `${x.tag}:${x.count}`)
            .join(" · ") || "—"}
        />
      </div>
    </GlassPanel>
  );
}

function MetricCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0d]/90 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          {icon}
        </span>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-tos-dim">{label}</p>
      </div>
      {highlight ? (
        <p className="mt-2 text-lg font-bold tabular-nums text-amber-300/95">{highlight}</p>
      ) : null}
      <p className={`text-xs leading-snug text-tos-text ${highlight ? "mt-1" : "mt-2"}`}>{value}</p>
    </div>
  );
}
