"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { AnnotationPoint, ChartAnnotation } from "@/components/chart/annotations/types";

type Props = {
  annotations: ChartAnnotation[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  onUpdate: (annotation: ChartAnnotation) => void;
  onRemove?: (annotationId: string) => void;
  /**
   * Pixel X position of the future-projection cursor (chart-frame coords).
   * When supplied, trendlines with `settings.extendRight` extrapolate to
   * this X so the user can see where price would meet the line in the
   * future. Falls back to the right edge of the SVG when null.
   */
  futureProjectionX?: number | null;
  /** Dark theme — Paper mode needs darker colors. */
  isDark?: boolean;
};

type TrendGeom = {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Extrapolated line tip when extendRight=true; same as bx/by otherwise. */
  rx: number;
  ry: number;
  extend: boolean;
  /** "up" = lower trendline (through swing lows), "down" = upper (through swing highs). */
  direction: "up" | "down" | null;
};

/**
 * Derive the line colour from the trendline direction.
 *   • Upper line (through swing highs, direction="down") → dark red
 *   • Lower line (through swing lows, direction="up") → blue/cyan (original)
 *   • No direction → fallback blue
 */
function lineColor(direction: "up" | "down" | null, isActive: boolean, dark: boolean): string {
  if (dark) {
    if (direction === "down") return isActive ? "rgba(220,38,38,0.92)" : "rgba(185,28,28,0.78)";
    return isActive ? "rgba(34,211,238,0.92)" : "rgba(110,178,252,0.78)";
  }
  if (direction === "down") return isActive ? "rgba(150,18,25,0.95)" : "rgba(130,10,20,0.82)";
  return isActive ? "rgba(0,100,120,0.95)" : "rgba(20,60,140,0.82)";
}
function projectionColor(direction: "up" | "down" | null, isActive: boolean, dark: boolean): string {
  if (dark) {
    if (direction === "down") return isActive ? "rgba(220,38,38,0.55)" : "rgba(185,28,28,0.45)";
    return isActive ? "rgba(34,211,238,0.55)" : "rgba(110,178,252,0.45)";
  }
  if (direction === "down") return isActive ? "rgba(150,18,25,0.40)" : "rgba(130,10,20,0.30)";
  return isActive ? "rgba(0,100,120,0.40)" : "rgba(20,60,140,0.30)";
}
function handleColor(direction: "up" | "down" | null, dark: boolean): string {
  if (dark) {
    if (direction === "down") return "rgba(248,113,113,0.95)";
    return "rgba(34,211,238,0.95)";
  }
  if (direction === "down") return "rgba(130,10,20,0.95)";
  return "rgba(0,90,100,0.95)";
}

export function TrendlineAnnotationLayer({
  annotations,
  canvasRef,
  onUpdate,
  onRemove,
  futureProjectionX = null,
  isDark = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<TrendGeom[]>([]);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Auto-Fib-style activation: when an auto-trendline is created the user can
  // tap one of its handles to start dragging. Tapping anywhere else on the
  // chart deselects → handles disappear and the line locks.
  const [activeId, setActiveId] = useState<string | null>(() => {
    // Newly added trendlines auto-activate so the dots are visible right
    // after drawing. If multiple exist we activate the most recent one.
    const lastTrend = annotations.filter((a) => a.type === "trendline").at(-1);
    return lastTrend?.id ?? null;
  });
  const lastSeenIdsRef = useRef<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  // Auto-activate the latest trendline when a new one is added (so handles
  // appear on first draw, just like Auto Fib).
  useEffect(() => {
    const ids = new Set(annotations.filter((a) => a.type === "trendline").map((a) => a.id));
    let newest: string | null = null;
    for (const id of ids) {
      if (!lastSeenIdsRef.current.has(id)) newest = id;
    }
    lastSeenIdsRef.current = ids;
    if (newest) setActiveId(newest);
  }, [annotations]);

  // Tap outside the trendline layer (e.g. on the chart) deselects → handles
  // disappear and the line "locks". Mirrors the Fib layer's behaviour.
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

  const dragRef = useRef<{
    annotationId: string;
    handle: 0 | 1 | "body";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originPoints: AnnotationPoint[];
  } | null>(null);

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
      const lines = annotations.filter((a) => a.type === "trendline" && a.points.length >= 2);
      const next: TrendGeom[] = [];
      const hostWidth = host?.getBoundingClientRect().width ?? 0;
      for (const ann of lines) {
        const a = ann.points[0];
        const b = ann.points[1];
        const xA = h.timeToCoordinate(a.time);
        const xB = h.timeToCoordinate(b.time);
        const yA = h.priceToCoordinate(a.price);
        const yB = h.priceToCoordinate(b.price);
        if (xA == null || xB == null || yA == null || yB == null) continue;

        const settings = (ann.settings ?? {}) as Record<string, unknown>;
        const extend = Boolean(settings.extendRight);
        const direction = (settings.direction ?? null) as "up" | "down" | null;
        // Honour `settings.extendRight`: project the slope forward so the
        // line keeps going past the second swing all the way to the chart's
        // right edge (or to the future-projection cursor when supplied).
        let rx = xB;
        let ry = yB;
        if (extend) {
          const targetX = futureProjectionX != null && futureProjectionX > xB
            ? futureProjectionX
            : Math.max(hostWidth - 4, xB);
          if (Math.abs(xB - xA) > 0.0001) {
            const slope = (yB - yA) / (xB - xA);
            rx = targetX;
            ry = yB + slope * (targetX - xB);
          }
        }
        next.push({ id: ann.id, ax: xA, ay: yA, bx: xB, by: yB, rx, ry, extend, direction });
      }
      setGeoms(next);
    }

    compute();
    const unsubscribe = handle.subscribeViewport(compute);
    return unsubscribe;
  }, [annotations, canvasRef, futureProjectionX]);

  // ── Drag handling (supports endpoint + body drag) ──────────────────────
  function stopChartPointer(e: React.PointerEvent<SVGElement>) {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation?.();
  }

  function startDrag(
    e: React.PointerEvent<SVGElement>,
    annotationId: string,
    handleIdx: 0 | 1 | "body",
  ) {
    stopChartPointer(e);
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann || ann.type !== "trendline") return;
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
    if (!ann || ann.type !== "trendline") return;

    let nextPoints: AnnotationPoint[];
    if (drag.handle === "body") {
      // Body drag — move both endpoints by the same pixel delta, then
      // project back to time/price. Same approach as FibAnnotationLayer.
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

    onUpdate({ ...ann, points: nextPoints, updatedAt: new Date().toISOString() });
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
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
        style={{ touchAction: isDragging || activeId ? "none" : "manipulation" }}
      >
        {geoms.map((g) => {
          const isActive = activeId === g.id;
          const mx = (g.ax + g.bx) / 2;
          const my = (g.ay + g.by) / 2;
          const color = lineColor(g.direction, isActive, isDark);
          const projColor = projectionColor(g.direction, isActive, isDark);
          const dotColor = handleColor(g.direction, isDark);
          return (
            <g key={g.id}>
              {/* Invisible fat hit-line for body drag. Covers the
                  entire line + extension so it's easy to grab in
                  portrait. 36px wide — exceeds Apple 44pt minimum.
                  Starts drag immediately (no "tap-to-select" gate). */}
              <line
                x1={g.ax}
                y1={g.ay}
                x2={g.rx}
                y2={g.ry}
                stroke="transparent"
                strokeWidth={36}
                pointerEvents="stroke"
                onPointerDown={(e) => startDrag(e, g.id, "body")}
                style={{ cursor: "move", touchAction: "none" }}
              />

              {/* Solid segment between the two anchor swings */}
              <line
                x1={g.ax}
                y1={g.ay}
                x2={g.bx}
                y2={g.by}
                stroke={color}
                strokeWidth={isActive ? 2.4 : 2}
                strokeLinecap="round"
                pointerEvents="none"
              />

              {/* Right-side projection: keeps the slope but at slightly
                  reduced opacity, so the future ray reads as "guide" rather
                  than confirmed history. */}
              {g.extend ? (
                <line
                  x1={g.bx}
                  y1={g.by}
                  x2={g.rx}
                  y2={g.ry}
                  stroke={projColor}
                  strokeWidth={isActive ? 1.8 : 1.5}
                  strokeLinecap="round"
                  strokeDasharray="2 4"
                  pointerEvents="none"
                />
              ) : null}

              {/* Always-visible drag handles at both endpoints.
                  Large invisible touch target (r=28, 56px) for
                  reliable portrait-mode dragging. Starts drag
                  immediately — no "tap-to-select" gate. */}
              <g style={{ pointerEvents: "auto" }}>
                  {/* Handle A */}
                  <circle cx={g.ax} cy={g.ay} r={28}
                    fill="transparent" pointerEvents="all"
                    onPointerDown={(e) => startDrag(e, g.id, 0)}
                    style={{ cursor: "grab", touchAction: "none" }} />
                  <circle cx={g.ax} cy={g.ay}
                    r={isActive ? 8 : 5}
                    fill={isActive ? dotColor : dotColor.replace(/[\d.]+\)$/, "0.50)")}
                    stroke={isDark
                      ? (isActive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)")
                      : (isActive ? "rgba(60,55,50,0.85)" : "rgba(60,55,50,0.45)")}
                    strokeWidth={isActive ? 1.5 : 1}
                    pointerEvents="none" />
                  {/* Handle B */}
                  <circle cx={g.bx} cy={g.by} r={28}
                    fill="transparent" pointerEvents="all"
                    onPointerDown={(e) => startDrag(e, g.id, 1)}
                    style={{ cursor: "grab", touchAction: "none" }} />
                  <circle cx={g.bx} cy={g.by}
                    r={isActive ? 8 : 5}
                    fill={isActive ? dotColor : dotColor.replace(/[\d.]+\)$/, "0.50)")}
                    stroke={isDark
                      ? (isActive ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)")
                      : (isActive ? "rgba(60,55,50,0.85)" : "rgba(60,55,50,0.45)")}
                    strokeWidth={isActive ? 1.5 : 1}
                    pointerEvents="none" />
              </g>

              {onRemove && isActive ? (
                <g
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onPointerDown={(e) => {
                    stopChartPointer(e);
                    onRemove(g.id);
                  }}
                >
                  <rect
                    x={mx - 10}
                    y={my - 18}
                    width={20}
                    height={14}
                    rx={3}
                    fill={isDark ? "rgba(0,0,0,0.55)" : "rgba(215,214,208,0.55)"}
                    stroke={isDark ? "rgba(255,255,255,0.18)" : "rgba(60,55,50,0.18)"}
                  />
                  <text
                    x={mx}
                    y={my - 8}
                    textAnchor="middle"
                    fontFamily="ui-sans-serif, system-ui"
                    fontSize="9"
                    fill={isDark ? "rgba(232,238,246,0.92)" : "rgba(30,25,20,0.92)"}
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
