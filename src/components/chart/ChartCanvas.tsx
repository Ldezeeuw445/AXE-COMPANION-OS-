"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
} from "lightweight-charts";
import type { IPriceLine, UTCTimestamp, CandlestickData } from "lightweight-charts";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartOverlayRow } from "@/lib/broker/loadChartPageData";

type Props = {
  candles: MetaApiCandle[];
  overlays: ChartOverlayRow[];
};

function toUtcTimestamp(iso: string): UTCTimestamp | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export function ChartCanvas({ candles, overlays }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "rgba(6,8,12,0.96)" },
        textColor: "rgba(148,163,184,0.95)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "rgba(34,211,238,0.85)",
      downColor: "rgba(244,114,182,0.9)",
      borderVisible: false,
      wickUpColor: "rgba(34,211,238,0.55)",
      wickDownColor: "rgba(244,114,182,0.55)",
    });
    const data: CandlestickData[] = [];
    for (const c of candles) {
      const t = toUtcTimestamp(c.time);
      if (t == null) continue;
      data.push({
        time: t,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    }
    data.sort((a, b) => (a.time as number) - (b.time as number));
    series.setData(data);

    const priceLines: IPriceLine[] = [];
    for (const o of overlays) {
      if (o.entryPrice != null && o.entryPrice > 0) {
        priceLines.push(
          series.createPriceLine({
            price: o.entryPrice,
            title: `Entry ${o.side} ${o.volume}`,
            color: "rgba(34,211,238,0.55)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
          }),
        );
      }
      if (o.stopLoss != null && o.stopLoss > 0) {
        priceLines.push(
          series.createPriceLine({
            price: o.stopLoss,
            title: "SL",
            color: "rgba(248,113,113,0.65)",
            lineWidth: 1,
            lineStyle: LineStyle.SparseDotted,
          }),
        );
      }
      if (o.takeProfit != null && o.takeProfit > 0) {
        priceLines.push(
          series.createPriceLine({
            price: o.takeProfit,
            title: "TP",
            color: "rgba(52,211,153,0.65)",
            lineWidth: 1,
            lineStyle: LineStyle.SparseDotted,
          }),
        );
      }
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });

    return () => {
      ro.disconnect();
      for (const pl of priceLines) {
        series.removePriceLine(pl);
      }
      chart.remove();
    };
  }, [candles, overlays]);

  return <div ref={hostRef} className="h-[min(52vh,420px)] w-full min-h-[240px] rounded-xl border border-white/[0.08] bg-black/40" />;
}
