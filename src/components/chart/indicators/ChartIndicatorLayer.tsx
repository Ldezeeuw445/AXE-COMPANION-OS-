"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";

type Props = {
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  active: {
    volume?: boolean;
    rsi?: boolean;
    ma?: boolean;
    structure?: boolean;
  };
};

type Size = { w: number; h: number };
type Point = { x: number; y: number };
type IndicatorCandle = { time: number | null; open: number; high: number; low: number; close: number };
type StructurePivot = { index: number; time: number; price: number; kind: "high" | "low" };

export function ChartIndicatorLayer({ candles, canvasRef, active }: Props) {
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
      return {
        maPath: "",
        volumeBars: [],
        rsiPath: "",
        rsiTop: 48,
        rsiHeight: 96,
        structure: [],
        latestRsi: null as number | null,
      };
    }

    const visible = candles
      .map((candle) => ({
        ...candle,
        time: toTime(candle.time),
        close: Number(candle.close),
        high: Number(candle.high),
        low: Number(candle.low),
      }))
      .filter((candle) => candle.time != null)
      .filter((candle) => [candle.close, candle.high, candle.low].every(Number.isFinite));

    const ma = sma(visible.map((candle) => candle.close), 20);
    const maPoints: Point[] = visible
      .map((candle, index) => {
        if (ma[index] == null || candle.time == null) return null;
        const x = handle.timeToCoordinate(candle.time);
        const y = handle.priceToCoordinate(ma[index]);
        if (x == null || y == null) return null;
        return { x, y };
      })
      .filter(Boolean) as Point[];

    const ranges = visible.map((candle) => Math.max(0, candle.high - candle.low));
    const maxRange = Math.max(...ranges, 1);
    const volumeBase = size.h - 74;
    const volumeHeight = Math.max(42, size.h * 0.12);
    const volumeBars = visible
      .map((candle, index) => {
        if (candle.time == null) return null;
        const x = handle.timeToCoordinate(candle.time);
        if (x == null) return null;
        const h = Math.max(2, (ranges[index] / maxRange) * volumeHeight);
        return {
          x,
          y: volumeBase - h,
          h,
          color: candle.close >= candle.open ? "rgba(45,212,191,0.70)" : "rgba(239,68,68,0.72)",
        };
      })
      .filter(Boolean) as Array<{ x: number; y: number; h: number; color: string }>;

    const rsiValues = rsi(visible.map((candle) => candle.close), 14);
    const rsiTop = Math.max(48, size.h - 150);
    const rsiHeight = 96;
    const rsiPoints: Point[] = visible
      .map((candle, index) => {
        const value = rsiValues[index];
        if (value == null || candle.time == null) return null;
        const x = handle.timeToCoordinate(candle.time);
        if (x == null) return null;
        return { x, y: rsiTop + (1 - value / 100) * rsiHeight };
      })
      .filter(Boolean) as Point[];

    const pivots = structurePivots(visible);
    const structure = pivots
      .map((pivot) => {
        const x = handle.timeToCoordinate(pivot.time);
        const y = handle.priceToCoordinate(pivot.price);
        if (x == null || y == null) return null;
        return {
          x,
          y: y + (pivot.kind === "low" ? 16 : -8),
          label: pivot.label,
          kind: pivot.kind,
        };
      })
      .filter(Boolean) as Array<{ x: number; y: number; label: string; kind: "high" | "low" }>;

    return {
      maPath: toPath(maPoints),
      volumeBars,
      rsiPath: toPath(rsiPoints),
      rsiTop,
      rsiHeight,
      structure,
      latestRsi: rsiValues.filter((value): value is number => value != null).at(-1) ?? null,
    };
  }, [active, candles, canvasRef, size.h, size.w, version]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-[22]" aria-hidden>
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0">
        {active.ma && geometry.maPath ? (
          <path d={geometry.maPath} fill="none" stroke="rgba(96,165,250,0.92)" strokeWidth={1.7} />
        ) : null}

        {active.structure
          ? geometry.structure.map((item, index) => (
              <g key={`${item.label}-${index}`}>
                <text
                  x={item.x}
                  y={item.y}
                  textAnchor="middle"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize="10"
                  fontWeight="700"
                  fill={item.kind === "high" ? "rgba(34,211,238,0.92)" : "rgba(45,212,191,0.92)"}
                  stroke="rgba(0,0,0,0.75)"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {item.label}
                </text>
              </g>
            ))
          : null}

        {active.volume
          ? geometry.volumeBars.map((bar, index) => (
              <rect key={index} x={bar.x - 2} y={bar.y} width={4} height={bar.h} rx={1} fill={bar.color} />
            ))
          : null}

        {active.rsi ? (
          <g>
            <rect
              x={0}
              y={geometry.rsiTop}
              width={size.w}
              height={geometry.rsiHeight}
              fill="rgba(0,0,0,0.34)"
              stroke="rgba(255,255,255,0.08)"
            />
            {[25, 50, 75].map((level) => (
              <line
                key={level}
                x1={0}
                x2={size.w}
                y1={geometry.rsiTop + (1 - level / 100) * geometry.rsiHeight}
                y2={geometry.rsiTop + (1 - level / 100) * geometry.rsiHeight}
                stroke="rgba(255,255,255,0.18)"
                strokeDasharray="5 5"
              />
            ))}
            <path d={geometry.rsiPath} fill="none" stroke="rgba(59,130,246,0.95)" strokeWidth={2} />
            <text x={8} y={geometry.rsiTop + 16} fontFamily="ui-monospace, monospace" fontSize="12" fill="rgba(232,238,246,0.86)">
              RSI(14) {geometry.latestRsi != null ? geometry.latestRsi.toFixed(2) : "--"}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function toTime(raw: string): number | null {
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function toPath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function sma(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
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

function structurePivots(candles: IndicatorCandle[]) {
  const visible = candles.filter((candle): candle is IndicatorCandle & { time: number } => candle.time != null).slice(-220);
  const strength = visible.length >= 120 ? 4 : 3;
  const minBarsBetweenSwings = strength * 2 + 2;
  const volatility = atr(visible, 14) ?? averageRange(visible);
  const minSwingMove = Math.max(volatility * 1.35, averageRange(visible) * 0.9);
  const candidates: StructurePivot[] = [];

  if (visible.length < strength * 2 + 8 || minSwingMove <= 0) return [];

  for (let index = strength; index < visible.length - strength; index += 1) {
    const candle = visible[index];
    const left = visible.slice(index - strength, index);
    const right = visible.slice(index + 1, index + strength + 1);
    const leftHigh = Math.max(...left.map((other) => other.high));
    const rightHigh = Math.max(...right.map((other) => other.high));
    const leftLow = Math.min(...left.map((other) => other.low));
    const rightLow = Math.min(...right.map((other) => other.low));

    if (candle.high > leftHigh && candle.high >= rightHigh) {
      candidates.push({ index, time: candle.time, price: candle.high, kind: "high" });
    }
    if (candle.low < leftLow && candle.low <= rightLow) {
      candidates.push({ index, time: candle.time, price: candle.low, kind: "low" });
    }
  }

  const swings = compactStructurePivots(candidates, minBarsBetweenSwings, minSwingMove);
  const pivots: Array<{ time: number; price: number; kind: "high" | "low"; label: string }> = [];
  let lastHigh: number | null = null;
  let lastLow: number | null = null;

  for (const swing of swings) {
    if (swing.kind === "high") {
      const label = lastHigh == null || swing.price > lastHigh ? "HH" : "LH";
      lastHigh = swing.price;
      pivots.push({ time: swing.time, price: swing.price, kind: "high", label });
    } else {
      const label = lastLow == null || swing.price > lastLow ? "HL" : "LL";
      lastLow = swing.price;
      pivots.push({ time: swing.time, price: swing.price, kind: "low", label });
    }
  }

  return pivots.slice(-10);
}

function compactStructurePivots(pivots: StructurePivot[], minBars: number, minMove: number): StructurePivot[] {
  const out: StructurePivot[] = [];

  for (const pivot of pivots) {
    const last = out.at(-1);
    if (!last) {
      out.push(pivot);
      continue;
    }

    if (pivot.kind === last.kind) {
      const moreExtreme = pivot.kind === "high" ? pivot.price > last.price : pivot.price < last.price;
      if (moreExtreme) out[out.length - 1] = pivot;
      continue;
    }

    const enoughBars = pivot.index - last.index >= minBars;
    const enoughMove = Math.abs(pivot.price - last.price) >= minMove;
    if (!enoughBars || !enoughMove) continue;

    out.push(pivot);
  }

  return out;
}

function atr(candles: Array<IndicatorCandle & { time: number }>, period: number): number | null {
  if (candles.length <= period + 1) return null;
  const ranges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    ranges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previous.close),
        Math.abs(candle.low - previous.close),
      ),
    );
  }
  const recent = ranges.slice(-period);
  if (!recent.length) return null;
  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

function averageRange(candles: Array<IndicatorCandle & { time: number }>): number {
  const recent = candles.slice(-40);
  if (!recent.length) return 0;
  return recent.reduce((sum, candle) => sum + Math.max(0, candle.high - candle.low), 0) / recent.length;
}
