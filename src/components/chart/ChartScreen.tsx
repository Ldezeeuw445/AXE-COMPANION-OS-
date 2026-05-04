"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LineChart, MessageSquare, Bell, BookOpen, ClipboardList } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import type { ChartPageData } from "@/lib/broker/loadChartPageData";

const ChartCanvas = dynamic(
  () => import("@/components/chart/ChartCanvas").then((m) => m.ChartCanvas),
  { ssr: false, loading: () => <div className="h-[min(52vh,420px)] animate-pulse rounded-xl bg-white/[0.04]" /> },
);

type Props = {
  data: ChartPageData;
};

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

export function ChartScreen({ data }: Props) {
  const router = useRouter();
  const tfLabel = CHART_TF_OPTIONS.find((t) => t.key === data.timeframeKey)?.label ?? data.timeframeKey.toUpperCase();

  function goSymbol(sym: string) {
    router.push(`/chart?symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(data.timeframeKey)}`);
  }

  function goTf(key: string) {
    router.push(`/chart?symbol=${encodeURIComponent(data.symbol)}&tf=${encodeURIComponent(key)}`);
  }

  const sym = data.symbol;
  const metaTf = data.metaApiTimeframe;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
      <ScreenHeader
        title="Chart"
        subtitle={`${sym} · ${tfLabel} · Broker OHLC via MetaApi MT5 (not Polygon/TwelveData).`}
        left={<LineChart className="h-6 w-6 text-cyan-400/80" aria-hidden />}
        right={data.providerStatus ? <Badge variant="long">{data.providerStatus}</Badge> : null}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-tos-dim">Symbol</label>
        <select
          value={sym}
          onChange={(e) => goSymbol(e.target.value)}
          className="max-w-[11rem] rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-tos-text"
        >
          {data.symbolOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-tos-dim">TF</span>
        <div className="flex flex-wrap gap-1">
          {CHART_TF_OPTIONS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => goTf(t.key)}
              className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                t.key === data.timeframeKey
                  ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/30"
                  : "bg-white/[0.04] text-tos-muted hover:bg-white/[0.08]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {data.dataError ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">{data.dataError}</p>
      ) : null}
      {data.hint ? <p className="text-xs text-tos-muted">{data.hint}</p> : null}

      {data.lastPrice != null ? (
        <p className="font-mono text-sm text-tos-text">
          Last <span className="text-cyan-300/90">{data.lastPrice.toFixed(sym.includes("JPY") ? 3 : 5)}</span>
          <span className="ml-2 text-[10px] text-tos-dim">({metaTf} close)</span>
        </p>
      ) : null}

      <ChartCanvas candles={data.candles} overlays={data.positionsOnSymbol} />

      {data.positionsOnSymbol.length > 0 ? (
        <GlassPanel className="!p-3 text-[11px] text-tos-muted">
          <span className="font-medium text-tos-text">Open on {sym}:</span>{" "}
          {data.positionsOnSymbol.map((o) => (
            <span key={o.id} className="mr-2 inline-block">
              {o.side} {o.volume} · P/L {o.profit?.toFixed(2) ?? "—"}
            </span>
          ))}
        </GlassPanel>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href={chatQ(
            `[AXE · chart ${sym} ${metaTf}]\nExplain structure, key levels and what matters next on this broker chart. Reference my open ${sym} positions if any.`,
          )}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-tos-muted transition-colors hover:border-cyan-500/25 hover:text-tos-text"
        >
          <MessageSquare className="h-4 w-4 shrink-0 text-cyan-400/80" />
          Ask AXE about this chart
        </Link>
        <Link
          href={chatQ(
            `[AXE · risk]\nRisk-check my open MT5 positions (especially ${sym}) — floating P/L, distance to SL/TP, and what needs attention.`,
          )}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-tos-muted transition-colors hover:border-cyan-500/25 hover:text-tos-text"
        >
          <ClipboardList className="h-4 w-4 shrink-0 text-cyan-400/80" />
          Risk check positions
        </Link>
        <Link
          href={`/alerts?symbol=${encodeURIComponent(sym)}`}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-tos-muted transition-colors hover:border-cyan-500/25 hover:text-tos-text"
        >
          <Bell className="h-4 w-4 shrink-0 text-cyan-400/80" />
          Set alert
        </Link>
        <Link
          href="/journal"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-tos-muted transition-colors hover:border-cyan-500/25 hover:text-tos-text"
        >
          <BookOpen className="h-4 w-4 shrink-0 text-cyan-400/80" />
          Journal this idea
        </Link>
      </div>
    </div>
  );
}
