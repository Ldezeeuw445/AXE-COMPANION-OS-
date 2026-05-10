"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import { macdSeries } from "@/lib/chart/indicatorMath";

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
};

type Size = { w: number; h: number };

const MIN_AXIS_WIDTH = 56;

export function IndicatorPane({ mode, candles, canvasRef }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [axisWidth, setAxisWidth] = useState<number>(MIN_AXIS_WIDTH);
  const [version, setVersion] = useState(0);

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
              ? "rgba(45,212,191,0.78)"
              : "rgba(239,68,68,0.78)",
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
            color: point.histogram >= 0 ? "rgba(45,212,191,0.72)" : "rgba(244,63,94,0.72)",
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

    const rsiValues = rsi(
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

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden border-t border-white/[0.06] bg-black/55"
    >
      <span className="pointer-events-none absolute left-2 top-1 text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-100/85">
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
          {/* Vertical separator between plot and axis gutter (subtle) */}
          <line
            x1={plotWidth}
            x2={plotWidth}
            y1={0}
            y2={size.h}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />

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
                        ? "rgba(255,255,255,0.16)"
                        : "rgba(255,255,255,0.08)"
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
              stroke="rgba(255,255,255,0.16)"
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
              stroke="rgba(34,211,238,0.95)"
              strokeWidth={1.6}
            />
          ) : null}

          {mode === "macd" && geometry.macdPath ? (
            <path
              d={geometry.macdPath}
              fill="none"
              stroke="rgba(34,211,238,0.95)"
              strokeWidth={1.4}
            />
          ) : null}
          {mode === "macd" && geometry.macdSignalPath ? (
            <path
              d={geometry.macdSignalPath}
              fill="none"
              stroke="rgba(250,204,21,0.92)"
              strokeWidth={1.15}
            />
          ) : null}

          {/* Right-axis labels — MT5 style numbers in the gutter */}
          {axisLabels.map((label, idx) => (
            <text
              key={idx}
              x={plotWidth + 6}
              y={label.y + 3}
              textAnchor="start"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="10"
              fill={label.emphasis ? "rgba(232,238,246,0.85)" : "rgba(168,180,196,0.7)"}
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

function rsi(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period) return out;
  for (let index = period; index < values.length; index += 1) {
    let gains = 0;
    let losses = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const change = values[cursor] - values[cursor - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }
    const averageGain = gains / period;
    const averageLoss = losses / period;
    out[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return out;
}
