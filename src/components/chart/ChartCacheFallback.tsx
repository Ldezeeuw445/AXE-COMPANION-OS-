"use client";

/**
 * ChartCacheFallback — shown inside <Suspense> while loadChartPageData resolves.
 *
 * Reads localStorage for the last cached candles and renders a static ChartCanvas
 * so the user sees candles in <100 ms. When the server component resolves,
 * React replaces this with the full ChartScreen.
 *
 * If no cache exists, shows a skeleton with the AXE breathe loader.
 */

import { useEffect, useRef, useState, memo } from "react";
import { ChartCanvas, type ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import { readCachedChart, type CachedChartSnapshot } from "@/lib/chart/clientChartCache";
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import { formatBrokerPrice } from "@/lib/broker/symbolFormat";
import { CHART_THEME } from "@/components/chart/chartTheme";

type Props = {
  symbol?: string;
  tf?: string;
};

export const ChartCacheFallback = memo(function ChartCacheFallback({ symbol, tf }: Props) {
  const [cache, setCache] = useState<CachedChartSnapshot | null>(null);
  const [checked, setChecked] = useState(false);
  const canvasRef = useRef<ChartCanvasHandle>(null);
  const displaySymbol = (symbol ?? "XAUUSD").toUpperCase();
  const tfKey = tf ?? "h1";
  const tfLabel = CHART_TF_OPTIONS.find((t) => t.key === tfKey)?.label ?? tfKey.toUpperCase();

  useEffect(() => {
    const cached = readCachedChart(displaySymbol, tfKey);
    if (cached) setCache(cached);
    setChecked(true);
  }, [displaySymbol, tfKey]);

  if (!checked) return null; // avoid flicker

  // ── Cached candles available → render static chart ───────────────
  if (cache && cache.candles.length > 0) {

    const lastPrice = cache.lastPrice ?? cache.candles.at(-1)?.close ?? null;
    const age = Math.round((Date.now() - cache.savedAt) / 60_000);

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{cache.symbol}</span>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/40">
              {tfLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {lastPrice != null && (
              <span className="font-mono text-sm font-semibold text-white/80">
                {formatBrokerPrice(cache.symbol, lastPrice)}
              </span>
            )}
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/60" />
          </div>
        </div>

        {/* Chart with cached candles */}
        <div className="relative flex-1">
          <ChartCanvas
            ref={canvasRef}
            candles={cache.candles}
            overlays={[]}
            symbol={cache.symbol}
          />
          {/* Loading overlay */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent pb-4 pt-8">
            <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/70 px-3 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
              <span className="text-[10px] font-medium text-white/50">
                Loading live data{age > 0 ? ` · cached ${age}m ago` : ""}…
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── No cache → skeleton ──────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white/70">{displaySymbol}</span>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/30">
            {tfLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400/70" />
          <span className="text-[11px] font-medium text-white/40">Loading chart data…</span>
        </div>
      </div>
    </div>
  );
});
