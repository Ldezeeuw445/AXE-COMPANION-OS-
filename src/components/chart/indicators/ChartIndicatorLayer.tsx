"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";

type Props = {
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  active: {
    ma?: boolean;
    structure?: boolean;
    orderBlocks?: boolean;
  };
};

type Size = { w: number; h: number };
type Point = { x: number; y: number };
type IndicatorCandle = { time: number | null; open: number; high: number; low: number; close: number };
type StructurePivot = { index: number; time: number; price: number; kind: "high" | "low" };
type StructureLabel = { x: number; y: number; label: string; kind: "high" | "low" };
type StructureLine = { x1: number; x2: number; y: number; label: string; bullish: boolean; continuation: boolean };
type StructureBox = { x: number; y: number; width: number; height: number; stroke: string; fill: string };
type StructureArrow = { x: number; y: number; label: string; bullish: boolean };

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
        structureLabels: [],
        structureLines: [],
        orderBlocks: [],
        fairValueGaps: [],
        swingFailures: [],
        equilibriumLine: null as { y: number } | null,
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

    const structureOverlay = buildStructureOverlay(visible, handle);

    return {
      maPath: toPath(maPoints),
      structureLabels: structureOverlay.labels,
      structureLines: structureOverlay.lines,
      orderBlocks: structureOverlay.orderBlocks,
      fairValueGaps: structureOverlay.fairValueGaps,
      swingFailures: structureOverlay.swingFailures,
      equilibriumLine: structureOverlay.equilibriumLine,
    };
  }, [candles, canvasRef, size.h, size.w, version]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-[22]" aria-hidden>
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0">
        {active.orderBlocks
          ? geometry.orderBlocks.map((box, index) => (
              <rect
                key={`ob-${index}`}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={box.fill}
                stroke={box.stroke}
                strokeWidth={1}
                rx={3}
              />
            ))
          : null}

        {active.orderBlocks
          ? geometry.fairValueGaps.map((box, index) => (
              <rect
                key={`fvg-${index}`}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={box.fill}
                stroke={box.stroke}
                strokeWidth={1}
                rx={2}
              />
            ))
          : null}

        {active.structure && geometry.equilibriumLine ? (
          <line
            x1={0}
            x2={size.w}
            y1={geometry.equilibriumLine.y}
            y2={geometry.equilibriumLine.y}
            stroke="rgba(91,156,246,0.48)"
            strokeDasharray="8 5"
          />
        ) : null}

        {active.structure
          ? geometry.structureLines.map((item, index) => (
              <g key={`line-${item.label}-${index}`}>
                <line
                  x1={item.x1}
                  x2={item.x2}
                  y1={item.y}
                  y2={item.y}
                  stroke={item.bullish ? "rgba(8,153,129,0.92)" : "rgba(242,54,69,0.92)"}
                  strokeWidth={item.continuation ? 1.35 : 2}
                  strokeDasharray={item.continuation ? "6 5" : undefined}
                />
                <text
                  x={item.x2}
                  y={item.y - 6}
                  textAnchor="end"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize="10"
                  fontWeight="700"
                  fill={item.bullish ? "rgba(8,153,129,0.96)" : "rgba(242,54,69,0.96)"}
                  stroke="rgba(0,0,0,0.72)"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {item.label}
                </text>
              </g>
            ))
          : null}

        {active.ma && geometry.maPath ? (
          <path d={geometry.maPath} fill="none" stroke="rgba(96,165,250,0.92)" strokeWidth={1.7} />
        ) : null}

        {active.structure
          ? geometry.structureLabels.map((item, index) => (
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

        {active.structure
          ? geometry.swingFailures.map((item, index) => (
              <g key={`sfp-${index}`}>
                <text
                  x={item.x}
                  y={item.y}
                  textAnchor="middle"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize="10"
                  fontWeight="700"
                  fill={item.bullish ? "rgba(8,153,129,0.96)" : "rgba(242,54,69,0.96)"}
                  stroke="rgba(0,0,0,0.72)"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {item.label}
                </text>
              </g>
            ))
          : null}

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

function buildStructureOverlay(
  candles: IndicatorCandle[],
  handle: ChartCanvasHandle,
): {
  labels: StructureLabel[];
  lines: StructureLine[];
  orderBlocks: StructureBox[];
  fairValueGaps: StructureBox[];
  swingFailures: StructureArrow[];
  equilibriumLine: { y: number } | null;
} {
  const visible = candles.filter((candle): candle is IndicatorCandle & { time: number } => candle.time != null).slice(-220);
  if (visible.length < 12) {
    return {
      labels: [],
      lines: [],
      orderBlocks: [],
      fairValueGaps: [],
      swingFailures: [],
      equilibriumLine: null,
    };
  }

  const labels = structurePivots(visible)
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
    .filter(Boolean) as StructureLabel[];

  const strength = visible.length >= 120 ? 5 : 4;
  const pivotHighs = Array<number | null>(visible.length).fill(null);
  const pivotLows = Array<number | null>(visible.length).fill(null);
  for (let index = strength; index < visible.length - strength; index += 1) {
    const candle = visible[index];
    const left = visible.slice(index - strength, index);
    const right = visible.slice(index + 1, index + strength + 1);
    if (left.every((other) => candle.high > other.high) && right.every((other) => candle.high >= other.high)) {
      pivotHighs[index] = candle.high;
    }
    if (left.every((other) => candle.low < other.low) && right.every((other) => candle.low <= other.low)) {
      pivotLows[index] = candle.low;
    }
  }

  const lines: StructureLine[] = [];
  const swingFailures: StructureArrow[] = [];
  const orderBlocks: StructureBox[] = [];
  const fairValueGaps: StructureBox[] = [];
  let lastHi: number | null = null;
  let lastHiIdx: number | null = null;
  let lastLo: number | null = null;
  let lastLoIdx: number | null = null;
  let isBull = true;
  const displacementThreshold = atr(visible, 14) ?? averageRange(visible);

  for (let index = 0; index < visible.length; index += 1) {
    if (pivotHighs[index] != null) {
      lastHi = pivotHighs[index];
      lastHiIdx = index;
    }
    if (pivotLows[index] != null) {
      lastLo = pivotLows[index];
      lastLoIdx = index;
    }

    const candle = visible[index];
    const previous = index > 0 ? visible[index - 1] : null;

    if (lastHi != null && lastHiIdx != null && candle.close > lastHi) {
      const x1 = handle.timeToCoordinate(visible[lastHiIdx].time);
      const x2 = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(lastHi);
      if (x1 != null && x2 != null && y != null) {
        lines.push({
          x1,
          x2,
          y,
          label: isBull ? "BOS" : "MSS",
          bullish: true,
          continuation: isBull,
        });
      }
      isBull = true;
      lastHi = null;
      lastHiIdx = null;
    }

    if (lastLo != null && lastLoIdx != null && candle.close < lastLo) {
      const x1 = handle.timeToCoordinate(visible[lastLoIdx].time);
      const x2 = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(lastLo);
      if (x1 != null && x2 != null && y != null) {
        lines.push({
          x1,
          x2,
          y,
          label: isBull ? "MSS" : "BOS",
          bullish: false,
          continuation: !isBull,
        });
      }
      isBull = false;
      lastLo = null;
      lastLoIdx = null;
    }

    if (previous && displacementThreshold > 0 && Math.abs(candle.close - candle.open) > displacementThreshold * 0.9) {
      const top = Math.max(previous.open, previous.close);
      const bottom = Math.min(previous.open, previous.close);
      const x = handle.timeToCoordinate(previous.time);
      const x2 = handle.timeToCoordinate(visible[Math.min(index + 5, visible.length - 1)].time);
      const topY = handle.priceToCoordinate(top);
      const bottomY = handle.priceToCoordinate(bottom);
      if (x != null && x2 != null && topY != null && bottomY != null && Math.abs(bottomY - topY) > 1) {
        if (candle.close > candle.open && previous.close < previous.open) {
          orderBlocks.push({
            x,
            y: Math.min(topY, bottomY),
            width: Math.max(6, x2 - x),
            height: Math.max(2, Math.abs(bottomY - topY)),
            stroke: "rgba(45,212,191,0.65)",
            fill: "rgba(45,212,191,0.18)",
          });
        } else if (candle.close < candle.open && previous.close > previous.open) {
          orderBlocks.push({
            x,
            y: Math.min(topY, bottomY),
            width: Math.max(6, x2 - x),
            height: Math.max(2, Math.abs(bottomY - topY)),
            stroke: "rgba(239,68,68,0.65)",
            fill: "rgba(239,68,68,0.18)",
          });
        }
      }
    }

    if (index >= 2) {
      const twoBack = visible[index - 2];
      const x = handle.timeToCoordinate(twoBack.time);
      const x2 = handle.timeToCoordinate(candle.time);
      if (x != null && x2 != null) {
        if (candle.low > twoBack.high) {
          const topY = handle.priceToCoordinate(candle.low);
          const bottomY = handle.priceToCoordinate(twoBack.high);
          if (topY != null && bottomY != null && Math.abs(bottomY - topY) > 1) {
            fairValueGaps.push({
              x,
              y: Math.min(topY, bottomY),
              width: Math.max(4, x2 - x),
              height: Math.max(2, Math.abs(bottomY - topY)),
              stroke: "rgba(8,153,129,0.34)",
              fill: "rgba(8,153,129,0.06)",
            });
          }
        } else if (candle.high < twoBack.low) {
          const topY = handle.priceToCoordinate(twoBack.low);
          const bottomY = handle.priceToCoordinate(candle.high);
          if (topY != null && bottomY != null && Math.abs(bottomY - topY) > 1) {
            fairValueGaps.push({
              x,
              y: Math.min(topY, bottomY),
              width: Math.max(4, x2 - x),
              height: Math.max(2, Math.abs(bottomY - topY)),
              stroke: "rgba(242,54,69,0.34)",
              fill: "rgba(242,54,69,0.06)",
            });
          }
        }
      }
    }

    if (previous && lastHi != null && candle.high > lastHi && candle.close < lastHi && previous.high <= lastHi) {
      const x = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(candle.high);
      if (x != null && y != null) swingFailures.push({ x, y: y - 10, label: "SFP", bullish: false });
    }
    if (previous && lastLo != null && candle.low < lastLo && candle.close > lastLo && previous.low >= lastLo) {
      const x = handle.timeToCoordinate(candle.time);
      const y = handle.priceToCoordinate(candle.low);
      if (x != null && y != null) swingFailures.push({ x, y: y + 18, label: "SFP", bullish: true });
    }
  }

  const range = visible.slice(-50);
  const highest = Math.max(...range.map((candle) => candle.high));
  const lowest = Math.min(...range.map((candle) => candle.low));
  const midpoint = (highest + lowest) / 2;
  const equilibriumY = handle.priceToCoordinate(midpoint);

  return {
    labels,
    lines: lines.slice(-8),
    orderBlocks: orderBlocks.slice(-6),
    fairValueGaps: fairValueGaps.slice(-8),
    swingFailures: swingFailures.slice(-6),
    equilibriumLine: equilibriumY == null ? null : { y: equilibriumY },
  };
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
