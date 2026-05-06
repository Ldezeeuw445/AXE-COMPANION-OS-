"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
} from "lightweight-charts";
import type {
  CandlestickData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineData,
  MouseEventParams,
  UTCTimestamp,
} from "lightweight-charts";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartOverlayRow } from "@/lib/broker/loadChartPageData";
import { CHART_THEME } from "@/components/chart/chartTheme";
import { priceDigitsForSymbol } from "@/lib/broker/symbolFormat";
import {
  type AnnotationPoint,
  type ChartAnnotation,
} from "@/components/chart/annotations/types";

type DrawingMode = "fib_retracement" | "trendline" | null;

type Props = {
  /** Initial OHLC dataset; replaced on symbol/timeframe change. */
  candles: MetaApiCandle[];
  overlays: ChartOverlayRow[];
  /** Used to format right-axis prices (digits) and entry/SL/TP price labels. */
  symbol: string;
  annotations?: ChartAnnotation[];
  drawingMode?: DrawingMode;
  /** Called when a chart point is tapped while in drawing mode. */
  onPointClick?: (point: AnnotationPoint) => void;
};

export type ChartCanvasHandle = {
  /** Patch the latest bucket; appends a new candle if `candle.time` is newer than the last bar. */
  updateLastCandle: (candle: MetaApiCandle) => void;
  /** Apply a tick to the in-progress candle without changing time bucket. */
  applyTick: (price: number) => void;
  /** Project a price to its current pixel y-coordinate inside the chart frame. */
  priceToCoordinate: (price: number) => number | null;
  /** Project a UTC timestamp (seconds) to its pixel x-coordinate. */
  timeToCoordinate: (time: number) => number | null;
  /** Inverse of priceToCoordinate. */
  coordinateToPrice: (y: number) => number | null;
  /** Inverse of timeToCoordinate. */
  coordinateToTime: (x: number) => number | null;
  /** Reset chart viewport so candles are back in view. */
  fitContent: () => void;
  /** Subscribe to viewport changes (pan, zoom, resize, data load). */
  subscribeViewport: (cb: () => void) => () => void;
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
  { candles, overlays, symbol, annotations = [], drawingMode = null, onPointClick },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<CandlestickData | null>(null);
  const positionLinesRef = useRef<IPriceLine[]>([]);
  const annotationLineSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const annotationPriceLinesRef = useRef<IPriceLine[]>([]);
  const drawingModeRef = useRef<DrawingMode>(drawingMode);
  const onPointClickRef = useRef<typeof onPointClick>(onPointClick);
  const viewportSubscribersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    drawingModeRef.current = drawingMode;
    onPointClickRef.current = onPointClick;
  }, [drawingMode, onPointClick]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const digits = priceDigitsForSymbol(symbol);

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.chartCanvasBackground },
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

    const handleClick = (params: MouseEventParams) => {
      const mode = drawingModeRef.current;
      const cb = onPointClickRef.current;
      if (!mode || !cb) return;
      const ser = seriesRef.current;
      if (!ser || !params.point || params.time == null) return;
      const price = ser.coordinateToPrice(params.point.y);
      if (price == null || Number.isNaN(price)) return;
      cb({ time: Number(params.time), price: Number(price) });
    };
    chart.subscribeClick(handleClick);

    const fireViewport = () => {
      for (const cb of viewportSubscribersRef.current) {
        try {
          cb();
        } catch {
          /* ignore */
        }
      }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(fireViewport);
    chart.timeScale().subscribeVisibleLogicalRangeChange(fireViewport);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      fireViewport();
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    queueMicrotask(fireViewport);

    return () => {
      ro.disconnect();
      try {
        chart.unsubscribeClick(handleClick);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(fireViewport);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(fireViewport);
      } catch {
        /* ignore */
      }
      for (const pl of positionLinesRef.current) {
        try {
          series.removePriceLine(pl);
        } catch {
          /* ignore */
        }
      }
      positionLinesRef.current = [];
      for (const pl of annotationPriceLinesRef.current) {
        try {
          series.removePriceLine(pl);
        } catch {
          /* ignore */
        }
      }
      annotationPriceLinesRef.current = [];
      for (const ls of annotationLineSeriesRef.current) {
        try {
          chart.removeSeries(ls);
        } catch {
          /* ignore */
        }
      }
      annotationLineSeriesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lastBarRef.current = null;
    };
  }, [candles, symbol]);

  // Render open-position overlays.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const pl of positionLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    positionLinesRef.current = [];

    overlays.forEach((o, idx) => {
      const sideTitle = o.side === "buy" ? "Long" : o.side === "sell" ? "Short" : o.side;
      if (o.entryPrice != null && o.entryPrice > 0) {
        positionLinesRef.current.push(
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
        positionLinesRef.current.push(
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
        positionLinesRef.current.push(
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

  // Render user annotations (trendline + horizontal levels). Fib retracement
  // is rendered as an interactive SVG overlay outside the canvas.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    // Tear down previous annotation render.
    for (const pl of annotationPriceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    annotationPriceLinesRef.current = [];
    for (const ls of annotationLineSeriesRef.current) {
      try {
        chart.removeSeries(ls);
      } catch {
        /* ignore */
      }
    }
    annotationLineSeriesRef.current = [];

    annotations.forEach((ann, idx) => {
      if (ann.type === "fib_retracement") {
        // handled by FibAnnotationLayer
        return;
      }
      if (ann.type === "trendline") {
        // handled by TrendlineAnnotationLayer (interactive SVG overlay)
        return;
      }
      if (ann.type === "horizontal_level" && ann.points.length >= 1) {
        annotationPriceLinesRef.current.push(
          series.createPriceLine({
            price: ann.points[0].price,
            title: `Level ${idx + 1}`,
            color: "rgba(168,180,196,0.55)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
          }),
        );
      }
    });
  }, [annotations]);

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
          const merged: CandlestickData = {
            ...incoming,
            high: Math.max(incoming.high, last.high, last.close),
            low: Math.min(incoming.low, last.low, last.close),
            close: last.close,
          };
          series.update(merged);
          lastBarRef.current = merged;
          return;
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
      priceToCoordinate(price: number) {
        const ser = seriesRef.current;
        if (!ser || !Number.isFinite(price)) return null;
        const y = ser.priceToCoordinate(price);
        return y == null ? null : Number(y);
      },
      timeToCoordinate(time: number) {
        const chart = chartRef.current;
        if (!chart || !Number.isFinite(time)) return null;
        const x = chart.timeScale().timeToCoordinate(time as UTCTimestamp);
        return x == null ? null : Number(x);
      },
      coordinateToPrice(y: number) {
        const ser = seriesRef.current;
        if (!ser) return null;
        const p = ser.coordinateToPrice(y);
        return p == null || Number.isNaN(p) ? null : Number(p);
      },
      coordinateToTime(x: number) {
        const chart = chartRef.current;
        if (!chart) return null;
        const t = chart.timeScale().coordinateToTime(x);
        return t == null ? null : Number(t);
      },
      fitContent() {
        const chart = chartRef.current;
        if (!chart) return;
        chart.timeScale().fitContent();
        for (const cb of viewportSubscribersRef.current) {
          try {
            cb();
          } catch {
            /* ignore */
          }
        }
      },
      subscribeViewport(cb: () => void) {
        viewportSubscribersRef.current.add(cb);
        return () => {
          viewportSubscribersRef.current.delete(cb);
        };
      },
    }),
    [],
  );

  return (
    <>
      {/* Flat terminal base: keep the chart feeling native, not like a floating card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: CHART_THEME.chartCanvasBackground }}
      />

      {/* Chart canvas itself — transparent so the bg blend shows through */}
      <div
        ref={hostRef}
        className="absolute inset-0 h-full w-full"
        style={{
          cursor: drawingMode ? "crosshair" : undefined,
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: CHART_THEME.frameGlow }}
      />
    </>
  );
});
