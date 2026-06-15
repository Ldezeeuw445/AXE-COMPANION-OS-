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
  Logical,
  IPriceLine,
  ISeriesApi,
  LineData,
  MouseEventParams,
  UTCTimestamp,
} from "lightweight-charts";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartOverlayRow, PendingOrderOverlay } from "@/lib/broker/loadChartPageData";
import { getChartTheme, type ChartThemeKey } from "@/components/chart/chartTheme";
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
  pendingOrders?: PendingOrderOverlay[];
  /** Used to format right-axis prices (digits) and entry/SL/TP price labels. */
  symbol: string;
  annotations?: ChartAnnotation[];
  drawingMode?: DrawingMode;
  navigationLocked?: boolean;
  /** Called when a chart point is tapped while in drawing mode. */
  onPointClick?: (point: AnnotationPoint) => void;
  /** Chart color theme key. Defaults to "midnight". */
  themeKey?: ChartThemeKey;
  /** "grid" shows gridlines, "solid" hides them. Defaults to "grid". */
  gridStyle?: "grid" | "solid";
  /** Reserve top space (e.g. mobile chart toolbar in landscape). */
  layoutInsetTop?: number;
  /** Extra bottom inset inside the chart frame for time-axis labels. */
  layoutInsetBottom?: number;
  /** Tighter margins for short landscape viewports. */
  compactLayout?: boolean;
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
  setViewportPreset: (preset: number) => void;
  /** Subscribe to viewport changes (pan, zoom, resize, data load). */
  subscribeViewport: (cb: () => void) => () => void;
  /** Width (px) the right price scale currently occupies, so panes can mirror it. */
  getRightAxisWidth: () => number;
  /** Scroll the chart time axis by a pixel delta (negative = scroll left / back in time). */
  scrollByPixels: (deltaX: number) => void;
};

/** Default native zoom: how many of the most recent bars are visible at first paint
 *  and what each viewport preset maps to. Matches MT5's "show recent action" feel. */
const DEFAULT_VISIBLE_BARS = 100;
const PRESET_VISIBLE_BARS = [60, 120, 240];
const PRESET_RIGHT_OFFSET = [3, 5, 8];

/**
 * Compute MT5-style SL/TP label with PnL:
 *   "SL, -1 123.69 USD"  /  "TP, 5 711.01 USD"
 * Space as thousands separator, always 2 decimals, no "+" on positive.
 */
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

function readSeriesTimes(series: ISeriesApi<"Candlestick"> | null): number[] {
  if (!series) return [];
  const rows = series.data() as Array<{ time: unknown }>;
  const times: number[] = [];
  for (const row of rows) {
    const t = Number(row.time);
    if (Number.isFinite(t)) times.push(t);
  }
  return times;
}

function estimateBarStepSeconds(times: number[]): number {
  if (times.length < 2) return 60;
  const deltas: number[] = [];
  const start = Math.max(1, times.length - 60);
  for (let i = start; i < times.length; i += 1) {
    const d = times[i] - times[i - 1];
    if (Number.isFinite(d) && d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return 60;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] ?? 60;
}

function logicalToUnixTime(logical: number, times: number[], stepSec: number): number | null {
  if (!Number.isFinite(logical) || times.length === 0) return null;
  const first = times[0];
  const lastIndex = times.length - 1;
  const last = times[lastIndex];
  if (logical <= 0) return Math.round(first + logical * stepSec);
  if (logical >= lastIndex) return Math.round(last + (logical - lastIndex) * stepSec);
  const lo = Math.floor(logical);
  const hi = Math.ceil(logical);
  if (lo === hi) return Math.round(times[lo] ?? first);
  const loTime = times[lo] ?? first;
  const hiTime = times[hi] ?? loTime + stepSec;
  const frac = logical - lo;
  return Math.round(loTime + (hiTime - loTime) * frac);
}

function unixTimeToLogical(timeSec: number, times: number[], stepSec: number): number | null {
  if (!Number.isFinite(timeSec) || times.length === 0) return null;
  const first = times[0];
  const lastIndex = times.length - 1;
  const last = times[lastIndex];
  if (timeSec <= first) return (timeSec - first) / stepSec;
  if (timeSec >= last) return lastIndex + (timeSec - last) / stepSec;

  let lo = 0;
  let hi = lastIndex;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = times[mid];
    if (t === timeSec) return mid;
    if (t < timeSec) lo = mid + 1;
    else hi = mid - 1;
  }
  const left = Math.max(0, hi);
  const right = Math.min(lastIndex, lo);
  if (left === right) return left;
  const leftTime = times[left];
  const rightTime = times[right];
  const span = rightTime - leftTime;
  if (!Number.isFinite(span) || span <= 0) return left;
  const frac = (timeSec - leftTime) / span;
  return left + frac;
}

export const ChartCanvas = forwardRef<ChartCanvasHandle, Props>(function ChartCanvas(
  {
    candles,
    overlays,
    pendingOrders = [],
    symbol,
    annotations = [],
    drawingMode = null,
    navigationLocked = false,
    onPointClick,
    themeKey,
    gridStyle = "grid",
    layoutInsetTop = 0,
    layoutInsetBottom = 0,
    compactLayout = false,
  },
  ref,
) {
  const theme = getChartTheme(themeKey);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastBarRef = useRef<CandlestickData | null>(null);
  const positionLinesRef = useRef<IPriceLine[]>([]);
  const pendingOrderLinesRef = useRef<IPriceLine[]>([]);
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
        background: { type: ColorType.Solid, color: theme.chartCanvasBackground },
        textColor: theme.textColor,
        fontSize: 11,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue'",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridStyle === "solid" ? "transparent" : theme.grid, style: LineStyle.Solid },
        horzLines: { color: gridStyle === "solid" ? "transparent" : theme.grid, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.crosshair, width: 1, style: LineStyle.Dotted, labelBackgroundColor: theme.crosshairLabelBg },
        horzLine: { color: theme.crosshair, width: 1, style: LineStyle.Dotted, labelBackgroundColor: theme.crosshairLabelBg },
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: theme.axisSeparator,
        scaleMargins: { top: 0.08, bottom: compactLayout ? 0.22 : 0.18 },
        textColor: theme.textColor,
      },
      timeScale: {
        borderVisible: true,
        borderColor: theme.axisSeparator,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 6,
        timeVisible: true,
        minimumHeight: compactLayout ? 40 : 26,
      },
      autoSize: true,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: !navigationLocked,
        horzTouchDrag: !navigationLocked,
        vertTouchDrag: !navigationLocked,
      },
      handleScale: { axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: theme.bull,
      downColor: theme.bear,
      borderVisible: theme.borderVisible,
      borderUpColor: theme.bullBorder,
      borderDownColor: theme.bearBorder,
      wickUpColor: theme.bullWick,
      wickDownColor: theme.bearWick,
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

    // MT5-style: focus on the latest ~100 bars instead of squashing the entire
    // history. fitContent() pulls all candles into view which makes the chart
    // unreadable on phones the moment you have a few months of H1 data.
    if (data.length > 0) {
      const total = data.length;
      const visible = Math.min(DEFAULT_VISIBLE_BARS, total);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, total - visible),
        to: total + 4,
      });
    }

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
      for (const pl of pendingOrderLinesRef.current) {
        try {
          series.removePriceLine(pl);
        } catch {
          /* ignore */
        }
      }
      pendingOrderLinesRef.current = [];
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

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      rightPriceScale: {
        scaleMargins: { top: 0.08, bottom: compactLayout ? 0.22 : 0.18 },
      },
      timeScale: { minimumHeight: compactLayout ? 32 : 26 },
    });
  }, [compactLayout]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: !navigationLocked,
        horzTouchDrag: !navigationLocked,
        vertTouchDrag: !navigationLocked,
      },
    });
  }, [navigationLocked]);

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

    overlays.forEach((o) => {
      // Side-based color — red for sell, cyan for buy.
      const entryColor =
        o.side === "sell"
          ? theme.negativeText
          : o.side === "buy"
            ? theme.cyanAccent
            : theme.entryLine;

      // Lines only — labels rendered by PositionLabelsOverlay (left-side text, no box).
      if (o.entryPrice != null && o.entryPrice > 0) {
        positionLinesRef.current.push(
          series.createPriceLine({
            price: o.entryPrice,
            color: entryColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: "",
          }),
        );
      }
      if (o.stopLoss != null && o.stopLoss > 0) {
        positionLinesRef.current.push(
          series.createPriceLine({
            price: o.stopLoss,
            color: theme.stopLine,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "",
          }),
        );
      }
      if (o.takeProfit != null && o.takeProfit > 0) {
        positionLinesRef.current.push(
          series.createPriceLine({
            price: o.takeProfit,
            color: theme.takeLine,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "",
          }),
        );
      }
    });
  }, [overlays, symbol]);

  // Render pending-order overlays (limit & stop orders on chart).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const pl of pendingOrderLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    pendingOrderLinesRef.current = [];

    pendingOrders.forEach((o) => {
      // SL
      if (o.stopLoss != null && o.stopLoss > 0) {
        pendingOrderLinesRef.current.push(
          series.createPriceLine({
            price: o.stopLoss,
            color: theme.stopLine,
            lineWidth: 1,
            lineStyle: LineStyle.SparseDotted,
            axisLabelVisible: false,
            title: "",
          }),
        );
      }
      // TP
      if (o.takeProfit != null && o.takeProfit > 0) {
        pendingOrderLinesRef.current.push(
          series.createPriceLine({
            price: o.takeProfit,
            color: theme.takeLine,
            lineWidth: 1,
            lineStyle: LineStyle.SparseDotted,
            axisLabelVisible: false,
            title: "",
          }),
        );
      }
    });
  }, [pendingOrders, symbol]);

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
          // Keep the displayed/in-progress close anchored to the canonical
          // quote stream. Candle polling is still allowed to correct OHLC,
          // but it must not pull the visible price back to a stale candle
          // close between real broker ticks.
          const canonicalClose = Number.isFinite(last.close) ? last.close : incoming.close;
          const merged: CandlestickData = {
            ...incoming,
            high: Math.max(incoming.high, last.high, incoming.close, canonicalClose),
            low: Math.min(incoming.low, last.low, incoming.close, canonicalClose),
            close: canonicalClose,
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
        if (x != null) return Number(x);
        const times = readSeriesTimes(seriesRef.current);
        const stepSec = estimateBarStepSeconds(times);
        const logical = unixTimeToLogical(time, times, stepSec);
        if (logical == null) return null;
        const fallback = chart.timeScale().logicalToCoordinate(logical as Logical);
        return fallback == null ? null : Number(fallback);
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
        if (t != null) return Number(t);
        const logical = chart.timeScale().coordinateToLogical(x);
        if (logical == null || !Number.isFinite(logical)) return null;
        const times = readSeriesTimes(seriesRef.current);
        const stepSec = estimateBarStepSeconds(times);
        return logicalToUnixTime(Number(logical), times, stepSec);
      },
      fitContent() {
        const chart = chartRef.current;
        const ser = seriesRef.current;
        if (!chart || !ser) return;
        // Snap back to the recent window — same as the initial paint.
        const total = ser.data().length;
        if (total > 0) {
          const visible = Math.min(DEFAULT_VISIBLE_BARS, total);
          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(0, total - visible),
            to: total + 4,
          });
        } else {
          chart.timeScale().fitContent();
        }
        for (const cb of viewportSubscribersRef.current) {
          try {
            cb();
          } catch {
            /* ignore */
          }
        }
      },
      setViewportPreset(preset: number) {
        const chart = chartRef.current;
        const ser = seriesRef.current;
        if (!chart || !ser) return;
        const total = ser.data().length;
        const visible = PRESET_VISIBLE_BARS[preset] ?? DEFAULT_VISIBLE_BARS;
        const rightOffset = PRESET_RIGHT_OFFSET[preset] ?? 4;
        chart.timeScale().applyOptions({ rightOffset });
        if (total > 0) {
          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(0, total - Math.min(visible, total)),
            to: total + rightOffset,
          });
        }
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
      getRightAxisWidth() {
        const chart = chartRef.current;
        if (!chart) return 0;
        try {
          return chart.priceScale("right").width();
        } catch {
          return 0;
        }
      },
      scrollByPixels(deltaX: number) {
        const chart = chartRef.current;
        if (!chart) return;
        try {
          chart.timeScale().scrollToPosition(
            chart.timeScale().scrollPosition() + deltaX / 8,
            false,
          );
        } catch { /* ignore */ }
      },
    }),
    [],
  );

  const insetStyle = {
    top: layoutInsetTop,
    bottom: layoutInsetBottom,
    left: 0,
    right: 0,
  };

  return (
    <>
      {/* Flat terminal base: keep the chart feeling native, not like a floating card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ ...insetStyle, background: theme.chartCanvasBackground }}
      />

      {/* Chart canvas — top/bottom insets must NOT use h-full or the time axis clips off-screen. */}
      <div
        ref={hostRef}
        className="absolute"
        style={{
          ...insetStyle,
          cursor: drawingMode ? "crosshair" : undefined,
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          touchAction: "none",
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ ...insetStyle, boxShadow: theme.frameGlow }}
      />
    </>
  );
});
