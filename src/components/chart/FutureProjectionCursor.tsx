"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";

type Props = {
  /** Ref to the underlying chart canvas — we read pixel-per-bar from it. */
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  /** Recent candle times (unix seconds) used to estimate pixel-per-bar. */
  recentCandleTimes: number[];
  /** Storage key (per symbol/timeframe) so each chart remembers its position. */
  storageKey: string;
  /** Callback fired when the cursor's pixel X changes. Null when out of range. */
  onChange: (xInChartFrame: number | null) => void;
  /** When false the cursor is hidden and onChange is called with null. */
  enabled: boolean;
};

const DEFAULT_BAR_OFFSET = 12;

/**
 * MT5-style draggable vertical line living to the right of the last
 * candle. It's the single source of truth for "how far should
 * iFVG/OB/Fib levels project into the future". Position is stored as a
 * number of bars past the last candle so it stays consistent across
 * pan/zoom/timeframe changes.
 */
export function FutureProjectionCursor({
  canvasRef,
  recentCandleTimes,
  storageKey,
  onChange,
  enabled,
}: Props) {
  const lastCandleTime = recentCandleTimes.length > 0 ? recentCandleTimes[recentCandleTimes.length - 1] : null;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [version, setVersion] = useState(0);
  const [barOffset, setBarOffset] = useState<number>(() => readPersistedOffset(storageKey));
  const dragRef = useRef<{ pointerId: number; startClientX: number; startBarOffset: number } | null>(null);

  // Re-read persisted offset whenever the storage key changes (symbol or
  // timeframe switch). This keeps every chart's projection independent.
  useEffect(() => {
    setBarOffset(readPersistedOffset(storageKey));
  }, [storageKey]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setHostSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setHostSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    return handle.subscribeViewport(() => setVersion((v) => v + 1));
  }, [canvasRef]);

  const cursorX = useMemo<number | null>(() => {
    void version;
    if (!enabled) return null;
    const handle = canvasRef.current;
    if (!handle || lastCandleTime == null || hostSize.w <= 0) return null;
    const lastX = handle.timeToCoordinate(lastCandleTime);
    if (lastX == null) return null;
    const barWidth = estimateBarWidthPx(handle, recentCandleTimes);
    if (barWidth == null) return null;
    const x = lastX + barOffset * barWidth;
    // Clamp to the chart frame (leave a 4px gutter so we don't overlap
    // the price axis labels).
    const clamped = Math.max(lastX + barWidth * 1.5, Math.min(hostSize.w - 4, x));
    return clamped;
  }, [barOffset, canvasRef, enabled, hostSize.w, lastCandleTime, recentCandleTimes, version]);

  // Notify parent whenever the cursor moves.
  useEffect(() => {
    onChange(cursorX);
  }, [cursorX, onChange]);

  // Persist to localStorage when bar offset changes (debounced).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, String(barOffset));
      } catch {
        // Quota / private mode — silently ignore.
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [barOffset, storageKey]);

  if (!enabled || cursorX == null) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      <svg
        width={hostSize.w}
        height={hostSize.h}
        viewBox={`0 0 ${hostSize.w} ${hostSize.h}`}
        className="pointer-events-none absolute inset-0"
      >
        {/* Vertical projection line — soft enough to read as a guide, not
            interfere with candles behind it. */}
        <line
          x1={cursorX}
          x2={cursorX}
          y1={0}
          y2={hostSize.h}
          stroke="rgba(96,165,250,0.62)"
          strokeWidth={1.2}
          strokeDasharray="4 5"
        />

        {/* Drag handle — pointer-events:auto so finger/mouse events land
            on it even though the parent is pointer-events:none. */}
        <g
          style={{ pointerEvents: "auto", cursor: "ew-resize", touchAction: "none" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            (e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId);
            dragRef.current = {
              pointerId: e.pointerId,
              startClientX: e.clientX,
              startBarOffset: barOffset,
            };
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            e.stopPropagation();
            e.preventDefault();
            const handle = canvasRef.current;
            if (!handle || lastCandleTime == null) return;
            const barWidth = estimateBarWidthPx(handle, recentCandleTimes);
            if (barWidth == null || barWidth <= 0) return;
            const deltaPx = e.clientX - drag.startClientX;
            const deltaBars = deltaPx / barWidth;
            const next = Math.max(2, Math.min(120, Math.round(drag.startBarOffset + deltaBars)));
            setBarOffset(next);
          }}
          onPointerUp={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            e.stopPropagation();
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          {/* Larger transparent hit target — easy to grab on touch. */}
          <rect
            x={cursorX - 16}
            y={hostSize.h / 2 - 28}
            width={32}
            height={56}
            fill="transparent"
          />
          <circle
            cx={cursorX}
            cy={hostSize.h / 2}
            r={7}
            fill="rgba(96,165,250,0.95)"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={1.5}
          />
          {/* Bar offset label so the user always knows how far ahead the
              projection sits — quick reference for "5 bars ahead". */}
          <rect
            x={cursorX + 10}
            y={hostSize.h / 2 + 10}
            width={36}
            height={16}
            rx={3}
            fill="rgba(0,0,0,0.62)"
            stroke="rgba(96,165,250,0.45)"
          />
          <text
            x={cursorX + 28}
            y={hostSize.h / 2 + 21}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="9"
            fontWeight="700"
            fill="rgba(186,212,255,0.95)"
          >
            +{barOffset}
          </text>
        </g>
      </svg>
    </div>
  );
}

function readPersistedOffset(storageKey: string): number {
  if (typeof window === "undefined") return DEFAULT_BAR_OFFSET;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_BAR_OFFSET;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_BAR_OFFSET;
    return Math.max(2, Math.min(120, Math.round(n)));
  } catch {
    return DEFAULT_BAR_OFFSET;
  }
}

/**
 * Estimate pixel-per-bar by measuring deltas between consecutive REAL
 * candle times near the right edge. This is the most reliable signal —
 * lightweight-charts spaces real bars uniformly regardless of timeframe.
 */
function estimateBarWidthPx(handle: ChartCanvasHandle, recentTimes: number[]): number | null {
  if (recentTimes.length < 2) return 8;
  const tail = recentTimes.slice(-12);
  const sample: number[] = [];
  for (let i = 1; i < tail.length; i += 1) {
    const x = handle.timeToCoordinate(tail[i]);
    const previousX = handle.timeToCoordinate(tail[i - 1]);
    if (x != null && previousX != null) {
      const delta = x - previousX;
      if (Number.isFinite(delta) && delta > 0) sample.push(delta);
    }
  }
  if (sample.length === 0) return 8;
  sample.sort((a, b) => a - b);
  return sample[Math.floor(sample.length / 2)];
}
