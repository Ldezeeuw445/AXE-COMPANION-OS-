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
  FIB_LEVELS,
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
  const annotationLinesRef = useRef<IPriceLine[]>([]);
  const annotationLineSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const drawingModeRef = useRef<DrawingMode>(drawingMode);
  const onPointClickRef = useRef<typeof onPointClick>(onPointClick);

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

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });

    return () => {
      ro.disconnect();
      try {
        chart.unsubscribeClick(handleClick);
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
      for (const pl of annotationLinesRef.current) {
        try {
          series.removePriceLine(pl);
        } catch {
          /* ignore */
        }
      }
      annotationLinesRef.current = [];
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

  // Render user annotations (fib + trendline + horizontal levels).
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    // Tear down previous annotation render.
    for (const pl of annotationLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    annotationLinesRef.current = [];
    for (const ls of annotationLineSeriesRef.current) {
      try {
        chart.removeSeries(ls);
      } catch {
        /* ignore */
      }
    }
    annotationLineSeriesRef.current = [];

    annotations.forEach((ann, idx) => {
      if (ann.type === "fib_retracement" && ann.points.length >= 2) {
        const a = ann.points[0];
        const b = ann.points[1];
        const high = Math.max(a.price, b.price);
        const low = Math.min(a.price, b.price);
        const range = high - low;
        if (range <= 0) return;
        for (const lvl of FIB_LEVELS) {
          const price = high - range * lvl;
          annotationLinesRef.current.push(
            series.createPriceLine({
              price,
              title: `FIB ${(lvl * 100).toFixed(1)}%`,
              color:
                lvl === 0 || lvl === 1
                  ? "rgba(168,180,196,0.6)"
                  : "rgba(244,191,99,0.55)",
              lineWidth: 1,
              lineStyle: lvl === 0.5 || lvl === 0.618 ? LineStyle.Solid : LineStyle.Dotted,
            }),
          );
        }
      } else if (ann.type === "trendline" && ann.points.length >= 2) {
        const ls = chart.addSeries(LineSeries, {
          color: "rgba(110,178,252,0.85)",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        const lineData: LineData[] = [...ann.points]
          .sort((p1, p2) => p1.time - p2.time)
          .map((p) => ({ time: p.time as UTCTimestamp, value: p.price }));
        ls.setData(lineData);
        annotationLineSeriesRef.current.push(ls);
      } else if (ann.type === "horizontal_level" && ann.points.length >= 1) {
        annotationLinesRef.current.push(
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
    <>
      <div
        ref={hostRef}
        className="absolute inset-0 h-full w-full"
        style={{
          background: CHART_THEME.background,
          cursor: drawingMode ? "crosshair" : undefined,
        }}
      />
      {/* Subtle cyan glow — "light on it" without affecting candle readability */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          background:
            "radial-gradient(95% 60% at 78% 22%, rgba(34,211,238,0.18) 0%, rgba(34,211,238,0) 60%)",
        }}
      />
      {/* Top + bottom matte vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* Diagonal matte lines */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 4px)",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      {/* Inner cyan glow ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ boxShadow: CHART_THEME.frameGlow }}
      />
    </>
  );
});
