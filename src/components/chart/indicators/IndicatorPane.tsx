"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";

/**
 * IndicatorPane renders a single technical indicator (volume or RSI) in its
 * own bounded frame underneath the main chart. The pane reuses the main
 * chart's time scale by calling canvasRef.timeToCoordinate(...), so bars line
 * up exactly with the candles above. Because each pane is its own DOM box
 * with overflow hidden, the candle frame can never bleed into it (and vice
 * versa).
 */
type Mode = "volume" | "rsi";

type Props = {
  mode: Mode;
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
};

type Size = { w: number; h: number };

export function IndicatorPane({ mode, candles, canvasRef }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
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
    return handle.subscribeViewport(() => setVersion((v) => v + 1));
  }, [canvasRef]);

  const geometry = useMemo(() => {
    void version;
    const handle = canvasRef.current;
    if (!handle || size.w <= 0 || size.h <= 0) {
      return { volumeBars: [] as VolumeBar[], rsiPath: "", latestRsi: null as number | null };
    }

    const visible = candles
      .map((candle) => ({
        ...candle,
        time: toTime(candle.time),
        open: Number(candle.open),
        close: Number(candle.close),
        high: Number(candle.high),
        low: Number(candle.low),
      }))
      .filter((candle): candle is IndicatorCandle => candle.time != null)
      .filter((candle) =>
        [candle.open, candle.close, candle.high, candle.low].every(Number.isFinite),
      );

    if (mode === "volume") {
      const ranges = visible.map((candle) => Math.max(0, candle.high - candle.low));
      const maxRange = Math.max(...ranges, 1);
      const top = 16;
      const bottom = 6;
      const usable = Math.max(8, size.h - top - bottom);
      const volumeBars: VolumeBar[] = [];
      for (let i = 0; i < visible.length; i += 1) {
        const candle = visible[i];
        const x = handle.timeToCoordinate(candle.time);
        if (x == null) continue;
        const h = Math.max(2, (ranges[i] / maxRange) * usable);
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
      return { volumeBars, rsiPath: "", latestRsi: null };
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
      if (x == null) continue;
      rsiPoints.push({ x, y: top + (1 - value / 100) * usable });
    }
    return {
      volumeBars: [],
      rsiPath: toPath(rsiPoints),
      latestRsi: rsiValues.filter((value): value is number => value != null).at(-1) ?? null,
    };
  }, [candles, canvasRef, mode, size.h, size.w, version]);

  const top = mode === "rsi" ? 18 : 16;
  const bottom = 6;
  const usable = Math.max(20, size.h - top - bottom);

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden border-t border-white/[0.05] bg-black/45"
    >
      <span className="pointer-events-none absolute left-2 top-1 text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-100/80">
        {mode === "rsi"
          ? `RSI(14) ${geometry.latestRsi != null ? geometry.latestRsi.toFixed(2) : "--"}`
          : "Volume"}
      </span>
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0">
        {mode === "rsi"
          ? [25, 50, 75].map((level) => (
              <line
                key={level}
                x1={0}
                x2={size.w}
                y1={top + (1 - level / 100) * usable}
                y2={top + (1 - level / 100) * usable}
                stroke={
                  level === 50
                    ? "rgba(255,255,255,0.16)"
                    : "rgba(255,255,255,0.10)"
                }
                strokeDasharray="4 4"
              />
            ))
          : null}

        {mode === "volume"
          ? geometry.volumeBars.map((bar, index) => (
              <rect key={index} x={bar.x - 2} y={bar.y} width={4} height={bar.h} rx={1} fill={bar.color} />
            ))
          : null}

        {mode === "rsi" && geometry.rsiPath ? (
          <path d={geometry.rsiPath} fill="none" stroke="rgba(34,211,238,0.95)" strokeWidth={1.6} />
        ) : null}
      </svg>
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
