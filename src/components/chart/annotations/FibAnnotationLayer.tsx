"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import {
  FIB_LEVELS,
  type AnnotationPoint,
  type ChartAnnotation,
} from "@/components/chart/annotations/types";

type Props = {
  /** All annotations; the layer only renders fib_retracement entries. */
  annotations: ChartAnnotation[];
  /** Ref to the underlying chart canvas, used for coordinate projection. */
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  /** Number of decimal digits for the price label on the right side. */
  digits: number;
  /** Persist updated annotation back to the store. */
  onUpdate: (annotation: ChartAnnotation) => void;
  /** Remove a single annotation. */
  onRemove?: (annotationId: string) => void;
  /**
   * Pixel X position of the future-projection cursor (chart-frame coords).
   * When provided, fib retracements with `settings.extendRight` extend
   * their lines all the way to this X — so the trader can see the
   * intersection between the next candle and a level.
   */
  futureProjectionX?: number | null;
};

type FibLineGeom = {
  level: number;
  y: number;
  price: number;
};

type FibGeom = {
  id: string;
  startX: number;
  endX: number;
  /** Right-most X for level lines and price labels (= endX or projection). */
  rightX: number;
  /** y at level=0 (anchor). */
  anchorY: number;
  /** y at level=1 (swing). */
  swingY: number;
  anchorPrice: number;
  swingPrice: number;
  lines: FibLineGeom[];
  extend: boolean;
};

/**
 * Interactive Fibonacci retracement layer that mirrors broker apps:
 * - 7 horizontal levels (0, 23.6, 38.2, 50, 61.8, 78.6, 100)
 * - percentage labels on the LEFT, price labels on the RIGHT
 * - two draggable corner handles (anchor + swing) — drag, resize, flip
 *
 * Renders as an absolutely-positioned SVG over the chart frame. The layer
 * subscribes to the canvas viewport (pan/zoom/resize) so geometry stays
 * in sync.
 */
export function FibAnnotationLayer({
  annotations,
  canvasRef,
  digits,
  onUpdate,
  onRemove,
  futureProjectionX = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<FibGeom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    annotationId: string;
    handle: 0 | 1 | "body";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originPoints: AnnotationPoint[];
  } | null>(null);

  // Track container size for absolute positioning of the SVG.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setContainerSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  // Recompute pixel geometry on viewport / annotations change.
  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;

    function compute() {
      const h = canvasRef.current;
      const host = hostRef.current;
      if (!h) {
        setGeoms([]);
        return;
      }
      const fibs = annotations.filter((a) => a.type === "fib_retracement" && a.points.length >= 2);
      const next: FibGeom[] = [];
      const hostWidth = host?.getBoundingClientRect().width ?? 0;
      for (const ann of fibs) {
        const a = ann.points[0];
        const b = ann.points[1];
        const xA = h.timeToCoordinate(a.time);
        const xB = h.timeToCoordinate(b.time);
        const yA = h.priceToCoordinate(a.price);
        const yB = h.priceToCoordinate(b.price);
        if (xA == null || xB == null || yA == null || yB == null) continue;
        const startX = Math.min(xA, xB);
        const endX = Math.max(xA, xB);
        const anchorY = yA;
        const swingY = yB;
        const range = a.price - b.price;
        const lines: FibLineGeom[] = FIB_LEVELS.map((lvl) => {
          const price = a.price - range * lvl;
          const y = anchorY + (swingY - anchorY) * lvl;
          return { level: lvl, y, price };
        });
        const extend = Boolean(
          ann.settings && (ann.settings as Record<string, unknown>).extendRight,
        );
        // Stretch level lines past the swing so the user can see exactly
        // where price will cross each retracement. Without this the auto
        // fib looks like a static box stuck in the middle of the chart.
        const rightX = extend
          ? Math.max(
              endX,
              futureProjectionX != null && futureProjectionX > endX
                ? futureProjectionX
                : Math.max(hostWidth - 4, endX),
            )
          : endX;
        next.push({
          id: ann.id,
          startX,
          endX,
          rightX,
          anchorY,
          swingY,
          anchorPrice: a.price,
          swingPrice: b.price,
          lines,
          extend,
        });
      }
      setGeoms(next);
    }

    compute();
    const unsubscribe = handle.subscribeViewport(compute);
    return unsubscribe;
  }, [annotations, canvasRef, futureProjectionX]);

  useEffect(() => {
    if (!activeId) return;

    function deselectWhenChartIsTapped(event: PointerEvent) {
      const host = hostRef.current;
      const target = event.target;
      if (!host || !(target instanceof Node)) return;
      if (host.contains(target)) return;
      setActiveId(null);
    }

    window.addEventListener("pointerdown", deselectWhenChartIsTapped, true);
    return () => window.removeEventListener("pointerdown", deselectWhenChartIsTapped, true);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    if (annotations.some((annotation) => annotation.id === activeId)) return;
    setActiveId(null);
  }, [activeId, annotations]);

  // ── Drag handling ───────────────────────────────────────────────────────
  function stopChartPointer(e: React.PointerEvent<SVGElement>) {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation?.();
  }

  function startDrag(e: React.PointerEvent<SVGElement>, annotationId: string, handleIdx: 0 | 1 | "body") {
    stopChartPointer(e);
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann || ann.type !== "fib_retracement") return;
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      annotationId,
      handle: handleIdx,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPoints: ann.points.map((p) => ({ ...p })),
    };
    setActiveId(annotationId);
    setIsDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    stopChartPointer(e);
    const handle = canvasRef.current;
    const host = hostRef.current;
    if (!handle || !host) return;
    const rect = host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = handle.coordinateToTime(x);
    const price = handle.coordinateToPrice(y);
    if (time == null || price == null) return;

    const ann = annotations.find((a) => a.id === drag.annotationId);
    if (!ann || ann.type !== "fib_retracement") return;

    let nextPoints: AnnotationPoint[];
    if (drag.handle === "body") {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      nextPoints = drag.originPoints.map((point) => {
        const originalX = handle.timeToCoordinate(point.time);
        const originalY = handle.priceToCoordinate(point.price);
        if (originalX == null || originalY == null) return point;
        const nextTime = handle.coordinateToTime(originalX + dx);
        const nextPrice = handle.coordinateToPrice(originalY + dy);
        if (nextTime == null || nextPrice == null) return point;
        return { time: nextTime, price: nextPrice };
      });
    } else {
      nextPoints = [...ann.points] as AnnotationPoint[];
      nextPoints[drag.handle] = { time, price };
    }

    onUpdate({
      ...ann,
      points: nextPoints,
      updatedAt: new Date().toISOString(),
    });
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.pointerId !== e.pointerId) return;
    stopChartPointer(e);
    dragRef.current = null;
    setIsDragging(false);
  }

  if (containerSize.w === 0 || containerSize.h === 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  if (geoms.length === 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      <svg
        ref={svgRef}
        width={containerSize.w}
        height={containerSize.h}
        viewBox={`0 0 ${containerSize.w} ${containerSize.h}`}
        className="pointer-events-none absolute inset-0"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: isDragging ? "none" : "manipulation" }}
      >
        {geoms.map((g) => {
          const isActive = activeId === g.id;
          // Anchor both percentage and price labels at the right edge of
          // the chart frame so they never sit on top of historical
          // candles. Price is the right-most (mono, brighter); the
          // percentage sits just to its left (UI font, dimmed). Same row.
          // Mirrors MT5's right-rail behaviour.
          const priceLabelRightX = Math.min(containerSize.w - 4, g.rightX + 6);
          // Reserve ~58px for the price text so the % can slot in just
          // to its left without overlap. Works for FX (5 digits),
          // metals (3 digits) and indices (1-2 digits).
          const pctLabelRightX = priceLabelRightX - 60;
          const removeX = Math.max(8, g.startX - 30);
          const removeY = Math.max(8, Math.min(g.anchorY, g.swingY) - 28);
          // The "trade range" rectangle stays bound to the original anchor
          // ↔ swing region — only the level lines extend right so the
          // visual leg matches the swing measured, while price guidance
          // projects forward.
          return (
            <g key={g.id}>
              {/* Translucent fill between 0 and 1 to mark the trade range */}
              <rect
                x={g.startX}
                y={Math.min(g.anchorY, g.swingY)}
                width={Math.max(2, g.endX - g.startX)}
                height={Math.abs(g.swingY - g.anchorY)}
                fill={isActive ? "rgba(34,211,238,0.08)" : "rgba(244,191,99,0.06)"}
                stroke={isActive ? "rgba(34,211,238,0.22)" : "transparent"}
                strokeWidth={1}
                pointerEvents="all"
                onPointerDown={(e) => startDrag(e, g.id, "body")}
                style={{ cursor: "move", touchAction: "none" }}
              />

              {/* Fib level lines */}
              {g.lines.map((ln) => {
                const isOuter = ln.level === 0 || ln.level === 1;
                const isMid = ln.level === 0.5 || ln.level === 0.618;
                const stroke = isOuter
                  ? "rgba(220,228,238,0.55)"
                  : isMid
                    ? "rgba(244,191,99,0.85)"
                    : "rgba(244,191,99,0.55)";
                return (
                  <g key={ln.level}>
                    <line
                      x1={g.startX}
                      x2={g.endX}
                      y1={ln.y}
                      y2={ln.y}
                      stroke="transparent"
                      strokeWidth={22}
                      pointerEvents="stroke"
                      onPointerDown={(e) => startDrag(e, g.id, "body")}
                      style={{ cursor: "move", touchAction: "none" }}
                    />
                    {/* Solid segment within the swing range */}
                    <line
                      x1={g.startX}
                      x2={g.endX}
                      y1={ln.y}
                      y2={ln.y}
                      stroke={stroke}
                      strokeWidth={isOuter || isMid ? 1.1 : 0.9}
                      strokeDasharray={isOuter ? "" : "4 3"}
                      pointerEvents="none"
                    />
                    {/* Right projection — softer/dashed so the future ray
                        reads as guidance, not confirmed history. */}
                    {g.extend && g.rightX > g.endX ? (
                      <line
                        x1={g.endX}
                        x2={g.rightX}
                        y1={ln.y}
                        y2={ln.y}
                        stroke={stroke}
                        strokeWidth={isOuter || isMid ? 0.9 : 0.7}
                        strokeDasharray="2 4"
                        opacity={0.7}
                        pointerEvents="none"
                      />
                    ) : null}
                    {/* Combined % + price label, both right-anchored on
                        the right rail. % uses a UI font / dimmed; price
                        uses mono / bright. Same row, ~6px gap. Stays
                        clear of historical candles regardless of where
                        the swing leg sits. */}
                    <text
                      x={pctLabelRightX}
                      y={ln.y - 3}
                      textAnchor="end"
                      fontFamily="ui-sans-serif, system-ui, -apple-system"
                      fontSize="10"
                      fontWeight={isMid ? 600 : 500}
                      fill={isMid ? "rgba(244,191,99,0.85)" : "rgba(232,238,246,0.62)"}
                      pointerEvents="none"
                    >
                      {(ln.level * 100).toFixed(1).replace(".", ",")}%
                    </text>
                    <text
                      x={priceLabelRightX}
                      y={ln.y - 3}
                      textAnchor="end"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      fontSize="10"
                      fontWeight={isMid ? 600 : 500}
                      fill={isMid ? "rgba(244,191,99,0.95)" : "rgba(232,238,246,0.82)"}
                      pointerEvents="none"
                    >
                      {ln.price.toFixed(digits)}
                    </text>
                  </g>
                );
              })}

              {/* Connector line between the two endpoints */}
              <line
                x1={g.startX}
                x2={g.endX}
                y1={g.anchorY}
                y2={g.swingY}
                stroke="rgba(110,178,252,0.45)"
                strokeWidth={1}
                strokeDasharray="2 3"
                pointerEvents="none"
              />

              {/* Two draggable handles — pointer-events auto so they catch input */}
              {isActive ? (
                <g style={{ pointerEvents: "auto" }}>
                  <circle
                    cx={g.startX}
                    cy={g.anchorY}
                    r={9}
                    fill="rgba(34,211,238,0.95)"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth={1.5}
                    onPointerDown={(e) => {
                      // Determine which annotation point this handle represents.
                      const ann = annotations.find((a) => a.id === g.id);
                      if (!ann) return;
                      const a = ann.points[0];
                      const b = ann.points[1];
                      const useFirst = a.time <= b.time;
                      startDrag(e, g.id, useFirst ? 0 : 1);
                    }}
                    style={{ cursor: "grab", touchAction: "none" }}
                  />
                  <circle
                    cx={g.endX}
                    cy={g.swingY}
                    r={9}
                    fill="rgba(34,211,238,0.95)"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth={1.5}
                    onPointerDown={(e) => {
                      const ann = annotations.find((a) => a.id === g.id);
                      if (!ann) return;
                      const a = ann.points[0];
                      const b = ann.points[1];
                      const useFirst = a.time <= b.time;
                      startDrag(e, g.id, useFirst ? 1 : 0);
                    }}
                    style={{ cursor: "grab", touchAction: "none" }}
                  />
                </g>
              ) : null}

              {/* Remove pill on the right edge near the connector line midpoint */}
              {onRemove && isActive ? (
                <g
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onPointerDown={(e) => {
                    stopChartPointer(e);
                    onRemove(g.id);
                  }}
                >
                  <rect
                    x={removeX}
                    y={removeY}
                    width={20}
                    height={14}
                    rx={3}
                    fill="rgba(0,0,0,0.55)"
                    stroke="rgba(255,255,255,0.18)"
                  />
                  <text
                    x={removeX + 10}
                    y={removeY + 10}
                    textAnchor="middle"
                    fontFamily="ui-sans-serif, system-ui"
                    fontSize="9"
                    fill="rgba(232,238,246,0.92)"
                  >
                    ✕
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
