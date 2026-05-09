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
  /** Pixel position of point[0] (handle 0). */
  pointAX: number;
  pointAY: number;
  /** Pixel position of point[1] (handle 1). */
  pointBX: number;
  pointBY: number;
  anchorPrice: number;
  swingPrice: number;
  lines: FibLineGeom[];
  extend: boolean;
  /** Render style: standard fib levels OR premium/discount banding. */
  style: "levels" | "premium_discount";
};

function fibLevelStyle(level: number): { stroke: string; label: string; width: number } {
  if (level === 0.5) {
    return {
      stroke: "rgba(59,130,246,0.9)",
      label: "rgba(96,165,250,0.95)",
      width: 1.15,
    };
  }
  if (level === 0.618 || level === 0.65) {
    return {
      stroke: "rgba(244,191,99,0.9)",
      label: "rgba(244,191,99,0.96)",
      width: 1.15,
    };
  }
  return {
    stroke: "rgba(45,212,191,0.62)",
    label: "rgba(125,238,226,0.82)",
    width: level === 0 || level === 1 ? 1.05 : 0.95,
  };
}

/**
 * Interactive Fibonacci retracement layer that mirrors broker apps:
 * - dotted horizontal levels only (no filled background)
 * - percentage + price labels on the RIGHT rail
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
        const settings = (ann.settings ?? {}) as Record<string, unknown>;
        const extend = Boolean(settings.extendRight);
        const style: "levels" | "premium_discount" =
          settings.style === "premium_discount" ? "premium_discount" : "levels";
        const rightEdgeTimeRaw = settings.rightEdgeTime;
        const rightEdgeTime =
          typeof rightEdgeTimeRaw === "number" && Number.isFinite(rightEdgeTimeRaw)
            ? rightEdgeTimeRaw
            : null;
        // Auto-Fib: clamp the right edge to candle[-N] (per-TF offset) so
        // the live candle never sits inside the fib's price band. When
        // the user drags the fib manually, `rightEdgeTime` is left in
        // place and we use the swing's time as the right edge — drag
        // works freely with NO clamping (per UX spec).
        let rightX = endX;
        if (extend) {
          if (rightEdgeTime != null) {
            const tfEdgeX = h.timeToCoordinate(rightEdgeTime);
            rightX = tfEdgeX != null && tfEdgeX > startX ? tfEdgeX : endX;
          } else {
            // Manually-drawn fib — keep historic behaviour: extend to the
            // future-projection cursor or chart edge.
            rightX = Math.max(
              endX,
              futureProjectionX != null && futureProjectionX > endX
                ? futureProjectionX
                : Math.max(hostWidth - 4, endX),
            );
          }
        }
        next.push({
          id: ann.id,
          startX,
          endX,
          rightX,
          anchorY,
          swingY,
          pointAX: xA,
          pointAY: yA,
          pointBX: xB,
          pointBY: yB,
          anchorPrice: a.price,
          swingPrice: b.price,
          lines,
          extend,
          style,
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
          // In premium/discount mode we only render 0%, 50% and 100% +
          // a faint zone tint. The trader sees one clean structural
          // half (premium) and one clean half (discount) — same anchors
          // as the standard fib so price levels still tag, just visually
          // less busy.
          const visibleLines =
            g.style === "premium_discount"
              ? g.lines.filter((ln) => ln.level === 0 || ln.level === 0.5 || ln.level === 1)
              : g.lines;
          const eqLine = g.lines.find((ln) => ln.level === 0.5);
          const anchorLine = g.lines.find((ln) => ln.level === 0);
          const swingExtreme = g.lines.find((ln) => ln.level === 1);
          return (
            <g key={g.id}>
              {/* Premium / Discount tint bands. Premium = the half above
                  equilibrium, discount = below. We tint very lightly so
                  the candles still read clearly. */}
              {g.style === "premium_discount" && eqLine && anchorLine && swingExtreme ? (
                <g pointerEvents="none">
                  <rect
                    x={g.startX}
                    y={Math.min(anchorLine.y, eqLine.y)}
                    width={Math.max(2, g.rightX - g.startX)}
                    height={Math.max(2, Math.abs(eqLine.y - anchorLine.y))}
                    fill={
                      anchorLine.y < eqLine.y
                        ? "rgba(244,63,94,0.075)"
                        : "rgba(45,212,191,0.085)"
                    }
                  />
                  <rect
                    x={g.startX}
                    y={Math.min(eqLine.y, swingExtreme.y)}
                    width={Math.max(2, g.rightX - g.startX)}
                    height={Math.max(2, Math.abs(swingExtreme.y - eqLine.y))}
                    fill={
                      anchorLine.y < eqLine.y
                        ? "rgba(45,212,191,0.085)"
                        : "rgba(244,63,94,0.075)"
                    }
                  />
                  {/* Premium / Discount labels at the right edge */}
                  <text
                    x={g.rightX - 6}
                    y={(Math.min(anchorLine.y, eqLine.y) + Math.max(anchorLine.y, eqLine.y)) / 2 + 3}
                    textAnchor="end"
                    fontFamily="ui-sans-serif, system-ui, -apple-system"
                    fontSize="9"
                    fontWeight={700}
                    fill={
                      anchorLine.y < eqLine.y
                        ? "rgba(252,165,165,0.92)"
                        : "rgba(167,243,208,0.92)"
                    }
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth="2"
                    paintOrder="stroke"
                  >
                    {anchorLine.y < eqLine.y ? "PREMIUM" : "DISCOUNT"}
                  </text>
                  <text
                    x={g.rightX - 6}
                    y={(Math.min(eqLine.y, swingExtreme.y) + Math.max(eqLine.y, swingExtreme.y)) / 2 + 3}
                    textAnchor="end"
                    fontFamily="ui-sans-serif, system-ui, -apple-system"
                    fontSize="9"
                    fontWeight={700}
                    fill={
                      anchorLine.y < eqLine.y
                        ? "rgba(167,243,208,0.92)"
                        : "rgba(252,165,165,0.92)"
                    }
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth="2"
                    paintOrder="stroke"
                  >
                    {anchorLine.y < eqLine.y ? "DISCOUNT" : "PREMIUM"}
                  </text>
                </g>
              ) : null}

              {/* Fib level lines */}
              {visibleLines.map((ln) => {
                const isFocus = ln.level === 0.5 || ln.level === 0.618 || ln.level === 0.65;
                const style = fibLevelStyle(ln.level);
                return (
                  <g key={ln.level}>
                    <line
                      x1={g.startX}
                      x2={g.rightX}
                      y1={ln.y}
                      y2={ln.y}
                      stroke="transparent"
                      strokeWidth={22}
                      pointerEvents="stroke"
                      onPointerDown={(e) => startDrag(e, g.id, "body")}
                      style={{ cursor: "move", touchAction: "none" }}
                    />
                    <line
                      x1={g.startX}
                      x2={g.rightX}
                      y1={ln.y}
                      y2={ln.y}
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      strokeDasharray="2 5"
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
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
                      fontWeight={isFocus ? 650 : 500}
                      fill={style.label}
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
                      fontWeight={isFocus ? 650 : 500}
                      fill={style.label}
                      pointerEvents="none"
                    >
                      {ln.price.toFixed(digits)}
                    </text>
                  </g>
                );
              })}

              {/* Two draggable handles — rendered at the ACTUAL point[0]
                  and point[1] coordinates (not at startX/endX). This is
                  the fix for the "dragging one handle starts moving the
                  whole fib" bug: the visual handle and the drag index
                  stay glued to the same logical point even when dragging
                  past the other point swaps the time order. The user
                  can extend the fib in either direction freely with no
                  clamping. */}
              {isActive ? (
                <g style={{ pointerEvents: "auto" }}>
                  <circle
                    cx={g.pointAX}
                    cy={g.pointAY}
                    r={9}
                    fill="rgba(34,211,238,0.95)"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth={1.5}
                    onPointerDown={(e) => startDrag(e, g.id, 0)}
                    style={{ cursor: "grab", touchAction: "none" }}
                  />
                  <circle
                    cx={g.pointBX}
                    cy={g.pointBY}
                    r={9}
                    fill="rgba(34,211,238,0.95)"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth={1.5}
                    onPointerDown={(e) => startDrag(e, g.id, 1)}
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
