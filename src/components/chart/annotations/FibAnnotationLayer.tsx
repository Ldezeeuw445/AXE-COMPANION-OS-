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
  /** y at level=0 (anchor). */
  anchorY: number;
  /** y at level=1 (swing). */
  swingY: number;
  anchorPrice: number;
  swingPrice: number;
  lines: FibLineGeom[];
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
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<FibGeom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    annotationId: string;
    handle: 0 | 1;
    pointerId: number;
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
      if (!h) {
        setGeoms([]);
        return;
      }
      const fibs = annotations.filter((a) => a.type === "fib_retracement" && a.points.length >= 2);
      const next: FibGeom[] = [];
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
        next.push({
          id: ann.id,
          startX,
          endX,
          anchorY,
          swingY,
          anchorPrice: a.price,
          swingPrice: b.price,
          lines,
        });
      }
      setGeoms(next);
    }

    compute();
    const unsubscribe = handle.subscribeViewport(compute);
    return unsubscribe;
  }, [annotations, canvasRef]);

  // ── Drag handling ───────────────────────────────────────────────────────
  function startDrag(e: React.PointerEvent<SVGCircleElement>, annotationId: string, handleIdx: 0 | 1) {
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { annotationId, handle: handleIdx, pointerId: e.pointerId };
    setActiveId(annotationId);
    setIsDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
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

    const nextPoints: AnnotationPoint[] = [...ann.points] as AnnotationPoint[];
    nextPoints[drag.handle] = { time, price };
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
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = null;
    setIsDragging(false);
  }

  if (containerSize.w === 0 || containerSize.h === 0) {
    return <div ref={hostRef} className="absolute inset-0" aria-hidden />;
  }

  if (geoms.length === 0) {
    return <div ref={hostRef} className="absolute inset-0" aria-hidden />;
  }

  return (
    <div ref={hostRef} className="absolute inset-0">
      <svg
        ref={svgRef}
        width={containerSize.w}
        height={containerSize.h}
        viewBox={`0 0 ${containerSize.w} ${containerSize.h}`}
        className="absolute inset-0"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: "none" }}
      >
        {geoms.map((g) => {
          const isActive = activeId === g.id;
          const labelLeftX = Math.max(8, g.startX - 6);
          const labelRightX = Math.min(containerSize.w - 8, g.endX + 6);
          return (
            <g key={g.id}>
              {/* Translucent fill between 0 and 1 to mark the trade range */}
              <rect
                x={g.startX}
                y={Math.min(g.anchorY, g.swingY)}
                width={Math.max(2, g.endX - g.startX)}
                height={Math.abs(g.swingY - g.anchorY)}
                fill="rgba(244,191,99,0.06)"
                pointerEvents="none"
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
                  <g key={ln.level} pointerEvents="none">
                    <line
                      x1={g.startX}
                      x2={g.endX}
                      y1={ln.y}
                      y2={ln.y}
                      stroke={stroke}
                      strokeWidth={isOuter || isMid ? 1.1 : 0.9}
                      strokeDasharray={isOuter ? "" : "4 3"}
                    />
                    {/* Percentage label — left side */}
                    <text
                      x={labelLeftX}
                      y={ln.y - 3}
                      textAnchor="end"
                      fontFamily="ui-sans-serif, system-ui, -apple-system"
                      fontSize="10"
                      fontWeight={isMid ? 600 : 500}
                      fill={isMid ? "rgba(244,191,99,0.95)" : "rgba(232,238,246,0.78)"}
                    >
                      {(ln.level * 100).toFixed(1).replace(".", ",")}%
                    </text>
                    {/* Price label — right side */}
                    <text
                      x={labelRightX}
                      y={ln.y - 3}
                      textAnchor="start"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      fontSize="10"
                      fontWeight={isMid ? 600 : 500}
                      fill={isMid ? "rgba(244,191,99,0.95)" : "rgba(232,238,246,0.78)"}
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
              <g style={{ pointerEvents: "auto" }}>
                <circle
                  cx={g.startX}
                  cy={g.anchorY}
                  r={isActive ? 9 : 7}
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
                  style={{ cursor: "grab" }}
                />
                <circle
                  cx={g.endX}
                  cy={g.swingY}
                  r={isActive ? 9 : 7}
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
                  style={{ cursor: "grab" }}
                />
              </g>

              {/* Remove pill on the right edge near the connector line midpoint */}
              {onRemove ? (
                <g
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRemove(g.id);
                  }}
                >
                  <rect
                    x={g.endX - 22}
                    y={Math.min(g.anchorY, g.swingY) - 18}
                    width={20}
                    height={14}
                    rx={3}
                    fill="rgba(0,0,0,0.55)"
                    stroke="rgba(255,255,255,0.18)"
                  />
                  <text
                    x={g.endX - 12}
                    y={Math.min(g.anchorY, g.swingY) - 8}
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
