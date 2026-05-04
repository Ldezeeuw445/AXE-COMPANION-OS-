"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
} from "lightweight-charts";
import type {
  CandlestickData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartOverlayRow } from "@/lib/broker/loadChartPageData";
import { CHART_THEME } from "@/components/chart/chartTheme";
import { priceDigitsForSymbol } from "@/lib/broker/symbolFormat";

type Props = {
  /** Initial OHLC dataset; replaced on symbol/timeframe change. */
  candles: MetaApiCandle[];
  overlays: ChartOverlayRow[];
  /** Used to format right-axis prices (digits) and entry/SL/TP price labels. */
  symbol: string;
};

export type ChartCanvasHandle = {
  /** Patch the latest bucket; appends a new candle if `candle.time` is newer than the last bar. */
  updateLastCandle: (candle: MetaApiCandle) => void;
  /** Apply a tick to the in-progress candle without changing time bucket. */
  applyTick: (price: number) => void;
};

function toUtcTimestamp(iso: string): UTCTimestamp | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function buildSeriesData(candles: MetaApiCandle[]): CandlestickData[] {
  const data: CandlestickData[] = [];
  for (const c of candles) {
    const t = toUtcTimestamp(c.time);
    if (t == null) continue;
    data.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close });
  }
  data.sort((a, b) => (a.time as number) - (b.time as number));
  return data;
}

export const ChartCanvas = forwardRef<ChartCanvasHandle, Props>(function ChartCanvas(
  { candles, overlays, symbol },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<CandlestickData | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const digits = priceDigitsForSymbol(symbol);

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.background },
        textColor: CHART_THEME.textColor,
        fontSize: 11,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue'",
      },
      grid: {
        vertLines: { color: CHART_THEME.grid, style: LineStyle.Solid },
        horzLines: { color: CHART_THEME.grid, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_THEME.crosshair, width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#0B1117" },
        horzLine: { color: CHART_THEME.crosshair, width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#0B1117" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.18 },
        textColor: CHART_THEME.textColor,
      },
      timeScale: {
        borderVisible: false,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 6,
      },
      autoSize: true,
      handleScale: { axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: CHART_THEME.bull,
      downColor: CHART_THEME.bear,
      borderVisible: false,
      wickUpColor: CHART_THEME.bullWick,
      wickDownColor: CHART_THEME.bearWick,
      priceFormat: { type: "price", precision: digits, minMove: Number(`1e-${digits}`) },
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dotted,
      priceLineColor: "rgba(168,180,196,0.55)",
    });
    seriesRef.current = series;

    const data = buildSeriesData(candles);
    series.setData(data);
    lastBarRef.current = data.length ? data[data.length - 1] : null;

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });

    return () => {
      ro.disconnect();
      for (const pl of priceLinesRef.current) {
        try {
          series.removePriceLine(pl);
        } catch {
          /* removed already */
        }
      }
      priceLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lastBarRef.current = null;
    };
  }, [candles, symbol]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const pl of priceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    priceLinesRef.current = [];

    overlays.forEach((o, idx) => {
      const sideTitle = o.side === "buy" ? "Long" : o.side === "sell" ? "Short" : o.side;
      if (o.entryPrice != null && o.entryPrice > 0) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: o.entryPrice,
            title: `${sideTitle} ${o.volume}${overlays.length > 1 ? ` · #${idx + 1}` : ""}`,
            color: CHART_THEME.entryLine,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
          }),
        );
      }
      if (o.stopLoss != null && o.stopLoss > 0) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: o.stopLoss,
            title: "SL",
            color: CHART_THEME.stopLine,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
          }),
        );
      }
      if (o.takeProfit != null && o.takeProfit > 0) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: o.takeProfit,
            title: "TP",
            color: CHART_THEME.takeLine,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
          }),
        );
      }
    });
  }, [overlays]);

  useImperativeHandle(
    ref,
    () => ({
      updateLastCandle(c: MetaApiCandle) {
        const series = seriesRef.current;
        if (!series) return;
        const t = toUtcTimestamp(c.time);
        if (t == null) return;
        const incoming: CandlestickData = {
          time: t,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        };
        const last = lastBarRef.current;
        if (last && last.time === incoming.time) {
          series.update(incoming);
        } else if (!last || (incoming.time as number) > (last.time as number)) {
          series.update(incoming);
        } else {
          return;
        }
        lastBarRef.current = incoming;
      },
      applyTick(price: number) {
        const series = seriesRef.current;
        const last = lastBarRef.current;
        if (!series || !last || !Number.isFinite(price)) return;
        const next: CandlestickData = {
          time: last.time,
          open: last.open,
          high: Math.max(last.high, price),
          low: Math.min(last.low, price),
          close: price,
        };
        series.update(next);
        lastBarRef.current = next;
      },
    }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className="relative h-[min(64vh,560px)] min-h-[320px] w-full overflow-hidden rounded-2xl border border-white/[0.06]"
      style={{ background: CHART_THEME.background }}
    />
  );
});
