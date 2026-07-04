"use client";

import { useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import { macdSeries, rsiSeries } from "@/lib/chart/indicatorMath";

/**
 * IndicatorPane renders a single technical indicator (volume or RSI) in its
 * own bounded frame underneath the main chart. The pane reuses the main
 * chart's time scale via canvasRef.timeToCoordinate(...) so bars line up
 * exactly with the candles above. We mirror the main chart's right price-axis
 * width as a reserved gutter on the right, and draw MT5-style axis labels
 * (max/zero for volume, 100/75/50/25/0 for RSI) into that gutter.
 */
type Mode = "volume" | "rsi" | "macd";

type Props = {
  mode: Mode;
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  /** Match the main chart background so indicator panes look seamless. */
  background?: string;
  /** Whether the theme is dark (adjusts separator/label colors). */
  isDark?: boolean;
};

type Size = { w: number; h: number };

const MIN_AXIS_WIDTH = 56;

/**
 * Theme-aware indicator colors — ensures visibility on both dark and light backgrounds.
 * Dark themes use bright/vivid colors; light (Paper) uses deeper, saturated tones.
 */
function indicatorColors(dark: boolean) {
  return dark
    ? {
        bullBar: "rgba(45,212,191,0.78)",
        bearBar: "rgba(239,68,68,0.78)",
        rsiLine: "rgba(34,211,238,0.95)",
        macdLine: "rgba(34,211,238,0.95)",
        macdSignal: "rgba(250,204,21,0.92)",
        macdHistBull: "rgba(45,212,191,0.72)",
        macdHistBear: "rgba(244,63,94,0.72)",
        levelLine: "rgba(255,255,255,0.16)",
        levelLineDim: "rgba(255,255,255,0.08)",
        separator: "rgba(255,255,255,0.04)",
        labelEmphasis: "rgba(232,238,246,0.85)",
        labelNormal: "rgba(168,180,196,0.7)",
        titleText: "text-white/70",
      }
    : {
        /* Paper palette — candle-coloured volume bars: light bull, darker bear */
        bullBar: "rgba(42,46,57,0.38)",        /* #2a2e39 lighter — bullish candle hint */
        bearBar: "rgba(19,23,34,0.72)",       /* #131722 — bearish candle body */
        rsiLine: "rgba(0,90,110,1)",          /* dark cyan — same hue as RSI cyan */
        macdLine: "rgba(0,90,110,1)",         /* dark cyan */
        macdSignal: "rgba(160,110,0,1)",      /* dark amber — same hue as yellow signal */
        macdHistBull: "rgba(0,100,85,0.92)",  /* dark teal */
        macdHistBear: "rgba(150,18,35,0.92)", /* dark rose */
        levelLine: "rgba(0,0,0,0.22)",
        levelLineDim: "rgba(0,0,0,0.12)",
        separator: "rgba(0,0,0,0.10)",
        labelEmphasis: "rgba(20,25,35,0.92)",
        labelNormal: "rgba(50,55,65,0.82)",
        titleText: "text-black/80",
      };
}

export function IndicatorPane({ mode, candles, canvasRef, background, isDark = true }: Props) {
  const clipId = `indicator-pane-plot-${useId().replace(/:/g, "")}`;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [axisWidth, setAxisWidth] = useState<number>(MIN_AXIS_WIDTH);
  const [version, setVersion] = useState(0);
  const colors = useMemo(() => indicatorColors(isDark), [isDark]);

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
      return {
        volumeBars: [] as VolumeBar[],
        volumeMax: 0,
        volumeSource: "volume" as "volume" | "range",
        rsiPath: "",
        latestRsi: null as number | null,
        macdPath: "",
        macdSignalPath: "",
        macdBars: [] as MacdBar[],
        latestMacd: null as number | null,
      };
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
        volumeBars,
        volumeMax: maxVolume,
        volumeSource: hasRealVolume ? "volume" : "range",
        rsiPath: "",
        latestRsi: null,
        macdPath: "",
        macdSignalPath: "",
        macdBars: [],
        latestMacd: null,
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
        volumeBars: [],
        volumeMax: maxAbs,
        volumeSource: "volume",
        rsiPath: "",
        latestRsi: null,
        macdPath: toPath(macdPoints),
        macdSignalPath: toPath(signalPoints),
        macdBars,
        latestMacd: macd.map((point) => point.macd).filter((value): value is number => value != null).at(-1) ?? null,
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
      volumeBars: [],
      volumeMax: 0,
      volumeSource: "volume",
      rsiPath: toPath(rsiPoints),
      latestRsi: rsiValues.filter((value): value is number => value != null).at(-1) ?? null,
      macdPath: "",
      macdSignalPath: "",
      macdBars: [],
      latestMacd: null,
    };
  }, [candles, canvasRef, mode, plotWidth, size.h, size.w, version]);

  const top = 18;
  const bottom = 6;
  const usable = Math.max(20, size.h - top - bottom);

  // Right-axis labels — drawn into the reserved gutter (axisWidth).
  const axisLabels: Array<{ y: number; text: string; emphasis?: boolean }> =
    mode === "rsi"
      ? [100, 75, 50, 25, 0].map((level) => ({
          y: top + (1 - level / 100) * usable,
          text: level.toFixed(2),
          emphasis: level === 50,
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
            {mode === "rsi"
              ? [25, 50, 75].map((level) => {
                  const y = top + (1 - level / 100) * usable;
                  return (
                    <line
                      key={level}
                      x1={0}
                      x2={plotWidth}
                      y1={y}
                      y2={y}
                      stroke={
                        level === 50
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

