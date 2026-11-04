"use client";

import { useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import { adxSeries, macdSeries, rsiSeries, stochasticSeries } from "@/lib/chart/indicatorMath";
import { toSegmentedPath } from "@/lib/chart/svgPath";
import type { PaneMode } from "@/lib/chart/panes";
import { CHART_THEME, type ChartThemeConfig } from "@/components/chart/chartTheme";

/**
 * IndicatorPane renders a single technical indicator in its own bounded frame
 * underneath the main chart. The pane reuses the main chart's time scale via
 * canvasRef.timeToCoordinate(...) so bars line up exactly with the candles
 * above. We mirror the main chart's right price-axis width as a reserved
 * gutter on the right, and draw MT5-style axis labels into that gutter
 * (max/zero for volume, 100/75/50/25/0 for the bounded oscillators).
 *
 * Stochastic and ADX draw gaps rather than lines where their maths has no
 * answer — a flat window for %K, the first `2 * period` bars for ADX. That is
 * `indicatorMath` returning null, and it must stay a gap here: joining across
 * it would draw a line through bars where nothing was computed.
 */
/** The pane this instance draws. One list, in `@/lib/chart/panes`. */
type Mode = PaneMode;

type Props = {
  mode: Mode;
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  /**
   * The chart's own theme. The pane used to hold two private palettes behind
   * an `isDark` boolean, so a color change in chartTheme.ts never reached the
   * indicator bars and a new preset silently inherited one of the two. The
   * values are unchanged — only where they live is.
   */
  theme?: ChartThemeConfig;
};

type Size = { w: number; h: number };

const MIN_AXIS_WIDTH = 56;

/**
 * Everything a pane can draw, in one shape.
 *
 * Each mode fills in its own fields and leaves the rest alone. Before this,
 * every branch of the memo spelled out all nine fields, so adding an indicator
 * meant touching four `return`s and the compiler was the only thing standing
 * between a forgotten line and a pane that silently drew nothing. Now a branch
 * spreads this and overrides what it computed.
 */
type PaneGeometry = {
  volumeBars: VolumeBar[];
  volumeMax: number;
  volumeSource: "volume" | "range";
  rsiPath: string;
  latestRsi: number | null;
  macdPath: string;
  macdSignalPath: string;
  macdBars: MacdBar[];
  latestMacd: number | null;
  stochKPath: string;
  stochDPath: string;
  latestStochK: number | null;
  latestStochD: number | null;
  adxPath: string;
  plusDiPath: string;
  minusDiPath: string;
  latestAdx: number | null;
};

/**
 * The 0-100 oscillators, and the levels a trader actually reads on each.
 *
 * Not one shared set: the lines that matter differ per indicator. RSI is read
 * against its midpoint; stochastic against 80 and 20, where it is called
 * overbought and oversold; ADX against 25, the line between "trending" and
 * "ranging" — below it the direction of +DI and -DI means little. Drawing 50
 * on an ADX pane would emphasise a level nobody uses.
 */
type BoundedMode = "rsi" | "stoch" | "adx";

const BOUNDED_SCALES: Record<BoundedMode, { levels: number[]; guides: number[]; emphasis: number }> = {
  rsi: { levels: [100, 75, 50, 25, 0], guides: [25, 50, 75], emphasis: 50 },
  stoch: { levels: [100, 80, 50, 20, 0], guides: [20, 50, 80], emphasis: 50 },
  adx: { levels: [100, 75, 50, 25, 0], guides: [25, 50], emphasis: 25 },
};

const EMPTY_GEOMETRY: PaneGeometry = {
  volumeBars: [],
  volumeMax: 0,
  volumeSource: "volume",
  rsiPath: "",
  latestRsi: null,
  macdPath: "",
  macdSignalPath: "",
  macdBars: [],
  latestMacd: null,
  stochKPath: "",
  stochDPath: "",
  latestStochK: null,
  latestStochD: null,
  adxPath: "",
  plusDiPath: "",
  minusDiPath: "",
  latestAdx: null,
};

export function IndicatorPane({ mode, candles, canvasRef, theme = CHART_THEME }: Props) {
  const clipId = `indicator-pane-plot-${useId().replace(/:/g, "")}`;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [axisWidth, setAxisWidth] = useState<number>(MIN_AXIS_WIDTH);
  const [version, setVersion] = useState(0);
  const colors = theme.indicator;
  const background = theme.chartCanvasBackground;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    const refresh = () => {
      const w = handle.getRightAxisWidth();
      setAxisWidth(w > 0 ? Math.max(MIN_AXIS_WIDTH, w) : MIN_AXIS_WIDTH);
      setVersion((v) => v + 1);
    };
    refresh();
    return handle.subscribeViewport(refresh);
  }, [canvasRef]);

  const plotWidth = Math.max(0, size.w - axisWidth);

  const geometry = useMemo(() => {
    void version;
    const handle = canvasRef.current;
    if (!handle || size.w <= 0 || size.h <= 0) {
      return EMPTY_GEOMETRY;
    }

    const visible = candles
      .map((candle) => ({
        ...candle,
        time: toTime(candle.time),
        open: Number(candle.open),
        close: Number(candle.close),
        high: Number(candle.high),
        low: Number(candle.low),
        tickVolume: candle.tickVolume != null ? Number(candle.tickVolume) : null,
        volume: candle.volume != null ? Number(candle.volume) : null,
      }))
      .filter((candle): candle is IndicatorCandle => candle.time != null)
      .filter((candle) =>
        [candle.open, candle.close, candle.high, candle.low].every(Number.isFinite),
      );

    if (mode === "volume") {
      const volumes = visible.map((candle) => {
        const raw = candle.tickVolume ?? candle.volume ?? 0;
        return Number.isFinite(raw) ? Math.max(0, Number(raw)) : 0;
      });
      const hasRealVolume = volumes.some((value) => value > 0);
      // MetaApi normally returns MT5 tickVolume. If a broker/account response
      // omits it, keep the pane useful by falling back to candle range, but
      // only when every real volume value is missing/zero.
      const values = hasRealVolume
        ? volumes
        : visible.map((candle) => Math.max(0, candle.high - candle.low));
      const maxVolume = Math.max(...values, 1);
      const top = 18;
      const bottom = 6;
      const usable = Math.max(8, size.h - top - bottom);
      const volumeBars: VolumeBar[] = [];
      for (let i = 0; i < visible.length; i += 1) {
        const candle = visible[i];
        const x = handle.timeToCoordinate(candle.time);
        if (x == null || x < 0 || x > plotWidth) continue;
        const value = values[i] ?? 0;
        const h = value <= 0 ? 0 : Math.max(1, (value / maxVolume) * usable);
        volumeBars.push({
          x,
          y: size.h - bottom - h,
          h,
          color:
            candle.close >= candle.open
              ? colors.bullBar
              : colors.bearBar,
        });
      }
      return {
        ...EMPTY_GEOMETRY,
        volumeBars,
        volumeMax: maxVolume,
        volumeSource: hasRealVolume ? "volume" : "range",
      };
    }

    if (mode === "macd") {
      const macd = macdSeries(visible.map((candle) => candle.close), 12, 26, 9);
      const values = macd.flatMap((point) => [point.macd, point.signal, point.histogram]).filter((value): value is number => value != null);
      const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1e-8);
      const top = 18;
      const bottom = 8;
      const usable = Math.max(20, size.h - top - bottom);
      const zeroY = top + usable / 2;
      const macdPoints: Array<{ x: number; y: number }> = [];
      const signalPoints: Array<{ x: number; y: number }> = [];
      const macdBars: MacdBar[] = [];
      for (let i = 0; i < visible.length; i += 1) {
        const x = handle.timeToCoordinate(visible[i].time);
        if (x == null || x < 0 || x > plotWidth) continue;
        const point = macd[i];
        if (point.histogram != null) {
          const barHeight = Math.abs(point.histogram / maxAbs) * (usable / 2);
          macdBars.push({
            x,
            y: point.histogram >= 0 ? zeroY - barHeight : zeroY,
            h: Math.max(1, barHeight),
            color: point.histogram >= 0 ? colors.macdHistBull : colors.macdHistBear,
          });
        }
        if (point.macd != null) macdPoints.push({ x, y: zeroY - (point.macd / maxAbs) * (usable / 2) });
        if (point.signal != null) signalPoints.push({ x, y: zeroY - (point.signal / maxAbs) * (usable / 2) });
      }
      return {
        ...EMPTY_GEOMETRY,
        volumeMax: maxAbs,
        macdPath: toPath(macdPoints),
        macdSignalPath: toPath(signalPoints),
        macdBars,
        latestMacd: macd.map((point) => point.macd).filter((value): value is number => value != null).at(-1) ?? null,
      };
    }

    if (mode === "stoch") {
      // 14/3/3, the MT5 default, so a trader reading both platforms sees the
      // same lines. %K may be null where a window was flat — see the note at
      // the top of the file; those become gaps, not interpolated segments.
      const stoch = stochasticSeries(visible, 14, 3, 3);
      const top = 18;
      const bottom = 6;
      const usable = Math.max(20, size.h - top - bottom);
      const kPoints: Array<{ x: number; y: number } | null> = [];
      const dPoints: Array<{ x: number; y: number } | null> = [];
      for (let i = 0; i < visible.length; i += 1) {
        const x = handle.timeToCoordinate(visible[i].time);
        if (x == null || x < 0 || x > plotWidth) continue;
        const point = stoch[i];
        kPoints.push(point.k == null ? null : { x, y: top + (1 - point.k / 100) * usable });
        dPoints.push(point.d == null ? null : { x, y: top + (1 - point.d / 100) * usable });
      }
      return {
        ...EMPTY_GEOMETRY,
        stochKPath: toSegmentedPath(kPoints),
        stochDPath: toSegmentedPath(dPoints),
        latestStochK: stoch.map((p) => p.k).filter((v): v is number => v != null).at(-1) ?? null,
        latestStochD: stoch.map((p) => p.d).filter((v): v is number => v != null).at(-1) ?? null,
      };
    }

    if (mode === "adx") {
      // Period 14. The first ADX value lands at bar 28, not 14 — DX needs a
      // full period of its own to smooth. Everything before that is null and
      // draws as nothing, which is the honest picture of "not enough history".
      const adx = adxSeries(visible, 14);
      const top = 18;
      const bottom = 6;
      const usable = Math.max(20, size.h - top - bottom);
      const adxPoints: Array<{ x: number; y: number } | null> = [];
      const plusPoints: Array<{ x: number; y: number } | null> = [];
      const minusPoints: Array<{ x: number; y: number } | null> = [];
      const place = (value: number | null, x: number) =>
        value == null ? null : { x, y: top + (1 - Math.min(100, Math.max(0, value)) / 100) * usable };
      for (let i = 0; i < visible.length; i += 1) {
        const x = handle.timeToCoordinate(visible[i].time);
        if (x == null || x < 0 || x > plotWidth) continue;
        const point = adx[i];
        adxPoints.push(place(point.adx, x));
        plusPoints.push(place(point.plusDi, x));
        minusPoints.push(place(point.minusDi, x));
      }
      return {
        ...EMPTY_GEOMETRY,
        adxPath: toSegmentedPath(adxPoints),
        plusDiPath: toSegmentedPath(plusPoints),
        minusDiPath: toSegmentedPath(minusPoints),
        latestAdx: adx.map((p) => p.adx).filter((v): v is number => v != null).at(-1) ?? null,
      };
    }

    const rsiValues = rsiSeries(
      visible.map((candle) => candle.close),
      14,
    );
    const top = 18;
    const bottom = 6;
    const usable = Math.max(20, size.h - top - bottom);
    const rsiPoints: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < visible.length; i += 1) {
      const value = rsiValues[i];
      if (value == null) continue;
      const x = handle.timeToCoordinate(visible[i].time);
      if (x == null || x < 0 || x > plotWidth) continue;
      rsiPoints.push({ x, y: top + (1 - value / 100) * usable });
    }
    return {
      ...EMPTY_GEOMETRY,
      rsiPath: toPath(rsiPoints),
      latestRsi: rsiValues.filter((value): value is number => value != null).at(-1) ?? null,
    };
    // `colors` belongs here: the volume bars and the MACD histogram bake their
    // colour into the geometry above. Without it, switching chart theme left
    // the bars painted in the old theme's colours until something else — a new
    // candle, a resize, a mode switch — happened to invalidate this memo. The
    // exhaustive-deps warning had been saying so for as long as the file
    // existed. The palettes are module constants, so this is one identity per
    // theme and recomputes exactly when the theme changes.
  }, [candles, canvasRef, colors, mode, plotWidth, size.h, size.w, version]);

  const top = 18;
  const bottom = 6;
  const usable = Math.max(20, size.h - top - bottom);

  // Right-axis labels — drawn into the reserved gutter (axisWidth).
  const bounded = BOUNDED_SCALES[mode as BoundedMode];
  const axisLabels: Array<{ y: number; text: string; emphasis?: boolean }> =
    bounded
      ? bounded.levels.map((level) => ({
          y: top + (1 - level / 100) * usable,
          text: level.toFixed(2),
          emphasis: level === bounded.emphasis,
        }))
      : mode === "macd"
        ? [
            { y: top + usable / 2, text: "0.00", emphasis: true },
            { y: top + 5, text: geometry.volumeMax.toFixed(2) },
            { y: size.h - bottom, text: (-geometry.volumeMax).toFixed(2) },
          ]
      : (() => {
          const m = geometry.volumeMax;
          return [
            { y: top + 6, text: m > 1000 ? formatThousands(m) : m.toFixed(0) },
            { y: size.h - bottom, text: "0" },
          ];
        })();

  /* ── Touch/pointer pan: dragging in indicator pane scrolls the main chart ── */
  const panRef = useRef<{ startX: number; pointerId: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only start pan on the plot area (not the axis gutter)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    if (localX > plotWidth) return; // tapped in axis gutter
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { startX: e.clientX, pointerId: e.pointerId };
  }, [plotWidth]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan || e.pointerId !== pan.pointerId) return;
    const dx = pan.startX - e.clientX; // positive = dragged left = scroll right (back in time)
    pan.startX = e.clientX;
    canvasRef.current?.scrollByPixels(dx);
  }, [canvasRef]);

  const onPointerEnd = useCallback((e: React.PointerEvent) => {
    if (!panRef.current || e.pointerId !== panRef.current.pointerId) return;
    panRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  return (
    <div
      ref={hostRef}
      className="tos-indicator-pane relative h-full w-full overflow-hidden touch-none"
      style={background ? { background } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <span className={`pointer-events-none absolute left-2 top-1 z-[1] text-[9px] font-bold uppercase tracking-[0.22em] ${colors.titleText}`}>
        {mode === "rsi"
          ? `RSI(14) ${geometry.latestRsi != null ? geometry.latestRsi.toFixed(2) : "--"}`
          : mode === "stoch"
            ? `STOCH(14,3,3) ${geometry.latestStochK != null ? geometry.latestStochK.toFixed(2) : "--"} / ${geometry.latestStochD != null ? geometry.latestStochD.toFixed(2) : "--"}`
          : mode === "adx"
            ? `ADX(14) ${geometry.latestAdx != null ? geometry.latestAdx.toFixed(2) : "--"}`
          : mode === "macd"
            ? `MACD(12,26,9) ${geometry.latestMacd != null ? geometry.latestMacd.toFixed(4) : "--"}`
          : `${geometry.volumeSource === "volume" ? "Volumes" : "Range"} ${
              geometry.volumeMax > 1000 ? formatThousands(geometry.volumeMax) : geometry.volumeMax.toFixed(0)
            }`}
      </span>

      {size.w > 0 ? (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="absolute inset-0"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={plotWidth} height={size.h} />
            </clipPath>
          </defs>

          {/* Vertical separator between plot and axis gutter (subtle) */}
          <line
            x1={plotWidth}
            x2={plotWidth}
            y1={0}
            y2={size.h}
            stroke={colors.separator}
            strokeWidth={1}
          />

          <g clipPath={`url(#${clipId})`}>
            {bounded
              ? bounded.guides.map((level) => {
                  const y = top + (1 - level / 100) * usable;
                  return (
                    <line
                      key={level}
                      x1={0}
                      x2={plotWidth}
                      y1={y}
                      y2={y}
                      stroke={
                        level === bounded.emphasis
                          ? colors.levelLine
                          : colors.levelLineDim
                      }
                      strokeDasharray="4 4"
                    />
                  );
                })
              : null}

            {mode === "macd" ? (
              <line
                x1={0}
                x2={plotWidth}
                y1={top + usable / 2}
                y2={top + usable / 2}
                stroke={colors.levelLine}
                strokeDasharray="4 4"
              />
            ) : null}

            {mode === "volume"
              ? geometry.volumeBars.map((bar, index) => (
                  <rect
                    key={index}
                    x={bar.x - 2}
                    y={bar.y}
                    width={4}
                    height={bar.h}
                    rx={1}
                    fill={bar.color}
                  />
                ))
              : null}

            {mode === "macd"
              ? geometry.macdBars.map((bar, index) => (
                  <rect
                    key={index}
                    x={bar.x - 2}
                    y={bar.y}
                    width={4}
                    height={bar.h}
                    rx={1}
                    fill={bar.color}
                  />
                ))
              : null}

            {mode === "rsi" && geometry.rsiPath ? (
              <path
                d={geometry.rsiPath}
                fill="none"
                stroke={colors.rsiLine}
                strokeWidth={1.6}
              />
            ) : null}

            {mode === "macd" && geometry.macdPath ? (
              <path
                d={geometry.macdPath}
                fill="none"
                stroke={colors.macdLine}
                strokeWidth={1.4}
              />
            ) : null}
            {mode === "macd" && geometry.macdSignalPath ? (
              <path
                d={geometry.macdSignalPath}
                fill="none"
                stroke={colors.macdSignal}
                strokeWidth={1.15}
              />
            ) : null}

            {mode === "stoch" && geometry.stochKPath ? (
              <path d={geometry.stochKPath} fill="none" stroke={colors.stochK} strokeWidth={1.5} />
            ) : null}
            {mode === "stoch" && geometry.stochDPath ? (
              <path d={geometry.stochDPath} fill="none" stroke={colors.stochD} strokeWidth={1.15} />
            ) : null}

            {/* +DI and -DI first, ADX last: ADX is the line being read, so it
                sits on top where the three cross. */}
            {mode === "adx" && geometry.plusDiPath ? (
              <path d={geometry.plusDiPath} fill="none" stroke={colors.plusDiLine} strokeWidth={1.15} />
            ) : null}
            {mode === "adx" && geometry.minusDiPath ? (
              <path d={geometry.minusDiPath} fill="none" stroke={colors.minusDiLine} strokeWidth={1.15} />
            ) : null}
            {mode === "adx" && geometry.adxPath ? (
              <path d={geometry.adxPath} fill="none" stroke={colors.adxLine} strokeWidth={1.6} />
            ) : null}
          </g>

          {/* Right-axis labels — MT5 style numbers in the gutter */}
          {axisLabels.map((label, idx) => (
            <text
              key={idx}
              x={plotWidth + 6}
              y={label.y + 3}
              textAnchor="start"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="10"
              fill={label.emphasis ? colors.labelEmphasis : colors.labelNormal}
            >
              {label.text}
            </text>
          ))}
        </svg>
      ) : null}
    </div>
  );
}

type VolumeBar = { x: number; y: number; h: number; color: string };
type MacdBar = VolumeBar;
type IndicatorCandle = {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
  tickVolume: number | null;
  volume: number | null;
};

function toTime(raw: string): number | null {
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function toPath(points: Array<{ x: number; y: number }>): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function formatThousands(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

