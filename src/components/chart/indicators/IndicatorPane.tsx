"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";

/**
 * IndicatorPane renders a single technical indicator (volume or RSI) in its
 * own bounded frame underneath the main chart. The pane reuses the main
 * chart's time scale via canvasRef.timeToCoordinate(...) so bars line up
 * exactly with the candles above. We mirror the main chart's right price-axis
 * width as a reserved gutter on the right, and draw MT5-style axis labels
 * (max/zero for volume, 100/75/50/25/0 for RSI) into that gutter.
 */
type Mode = "volume" | "rsi";

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
              ? "rgba(8,153,129,0.85)"
              : "rgba(242,54,69,0.85)",
        });
      }
      return {
        volumeBars,
        volumeMax: maxVolume,
        volumeSource: hasRealVolume ? "volume" : "range",
        rsiPath: "",
        latestRsi: null,
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
      : (() => {
          const m = geometry.volumeMax;
          return [
            { y: top + 6, text: m > 1000 ? formatThousands(m) : m.toFixed(0) },
            { y: size.h - bottom, text: "0" },
          ];
        })();

  const rsiOverbought = top + (1 - 70 / 100) * usable;
  const rsiOversold = top + (1 - 30 / 100) * usable;

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden bg-[#05070A]"
      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
    >
      {/* Premium header label */}
      <span
        className="pointer-events-none absolute left-2.5 top-1.5 font-sans text-[9px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "rgba(180,195,220,0.75)", fontFamily: "'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif" }}
      >
        {mode === "rsi"
          ? `RSI · 14 ${geometry.latestRsi != null ? `  ${geometry.latestRsi.toFixed(2)}` : ""}`
          : `${geometry.volumeSource === "volume" ? "Vol" : "Range"}`}
      </span>

      {size.w > 0 ? (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="absolute inset-0"
        >
          <defs>
            {/* RSI gradient fill under the line */}
            <linearGradient id="rsi-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(8,153,129,0.20)" />
              <stop offset="100%" stopColor="rgba(8,153,129,0)" />
            </linearGradient>
            {/* Volume bar gradient */}
            <linearGradient id="vol-bull-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(8,153,129,0.85)" />
              <stop offset="100%" stopColor="rgba(8,153,129,0.35)" />
            </linearGradient>
            <linearGradient id="vol-bear-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(242,54,69,0.85)" />
              <stop offset="100%" stopColor="rgba(242,54,69,0.35)" />
            </linearGradient>
          </defs>

          <line
            x1={plotWidth}
            x2={plotWidth}
            y1={0}
            y2={size.h}
            stroke="rgba(255,255,255,0.03)"
            strokeWidth={1}
          />

          {mode === "rsi" ? (
            <>
              {/* Overbought / oversold bands */}
              <rect
                x={0}
                y={rsiOverbought}
                width={plotWidth}
                height={Math.max(0, rsiOversold - rsiOverbought)}
                fill="rgba(255,255,255,0.02)"
              />
              {[30, 50, 70].map((level) => {
                const y = top + (1 - level / 100) * usable;
                return (
                  <line
                    key={level}
                    x1={0}
                    x2={plotWidth}
                    y1={y}
                    y2={y}
                    stroke={level === 50 ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)"}
                    strokeDasharray="3 5"
                  />
                );
              })}
            </>
          ) : null}

          {mode === "volume"
            ? geometry.volumeBars.map((bar, index) => {
                const isBull = bar.color.includes("45,212,191") || bar.color.includes("8,153,129");
                return (
                  <rect
                    key={index}
                    x={bar.x - 2.5}
                    y={bar.y}
                    width={5}
                    height={bar.h}
                    rx={0.5}
                    fill={isBull ? "url(#vol-bull-grad)" : "url(#vol-bear-grad)"}
                    opacity={0.9}
                  />
                );
              })
            : null}

          {mode === "rsi" && geometry.rsiPath ? (
            <>
              <path
                d={geometry.rsiPath}
                fill="none"
                stroke="rgba(8,153,129,0.85)"
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : null}

          {axisLabels.map((label, idx) => (
            <text
              key={idx}
              x={plotWidth + 6}
              y={label.y + 3}
              textAnchor="start"
              fontFamily="'Inter', 'SF Pro Text', -apple-system, system-ui, sans-serif"
              fontSize="9"
              fontWeight="500"
              fill={label.emphasis ? "rgba(210,220,235,0.75)" : "rgba(140,155,175,0.55)"}
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
