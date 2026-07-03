"use client";

import { LockIconSvg } from "@/components/chart/annotations/LockIconSvg";
import { useEffect, useRef, useState } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import {
  FIB_LEVELS,
  type AnnotationPoint,
  type ChartAnnotation,
} from "@/components/chart/annotations/types";

/**
 * Single right-rail offset. Every chart label that lives on the right
 * side (fib price, OB volume, iFVG label) anchors at
 * `hostWidth - RIGHT_RAIL_OFFSET` so they line up vertically with no
 * overlap. Wide enough to clear the price-axis gutter.
 */
const RIGHT_RAIL_OFFSET = 8;

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
   * their lines all the way to this X.
   */
  futureProjectionX?: number | null;
  /**
   * UTC seconds of the most recent candle in the live stream. Kept in
   * the interface for backwards compat but no longer used for left-clamp.
   */
  lastBarTimeSec?: number | null;
  /**
   * UTC seconds of the bar BEFORE {@link lastBarTimeSec}. Kept for compat.
   */
  prevBarTimeSec?: number | null;
  /** Dark theme — Paper mode needs different fib colors. */
  isDark?: boolean;
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
  /** Right-most X for level lines (= endX or projection edge). */
  rightX: number;

  /** y at level=0 (anchor). */
  anchorY: number;
  /** y at level=1 (swing). */
  swingY: number;
  anchorPrice: number;
  swingPrice: number;
  lines: FibLineGeom[];
  extend: boolean;
  extendLeft: boolean;
  style: "levels" | "premium_discount";
  /* ── Diagonal geometry ────────────────────────────────────────
     Follows the actual A→B draw direction (like TradingView).
     Point A = annotation.points[0], Point B = annotation.points[1].
     Handles sit at each endpoint for dragging. */
  diagAX: number;
  diagAY: number;
  diagBX: number;
  diagBY: number;
  locked: boolean;
};

/* ── Colour helpers ─────────────────────────────────────────────── */

/** Boundary levels (0% / 100%) get a gold/amber accent — like the yellow
 *  lines in the AMZN reference. Interior levels use teal/cyan. */
function fibLevelStyle(level: number, dark = true): { stroke: string; label: string; width: number } {
  const isBoundary = level === 0 || level === 1;
  if (dark) {
    /* Boundary (0% / 100%) — gold/yellow accent */
    if (isBoundary) return { stroke: "rgba(250,204,21,0.82)", label: "rgba(253,224,71,0.95)", width: 1.2 };
    if (level === 0.5) return { stroke: "rgba(34,211,238,0.88)", label: "rgba(103,232,249,0.96)", width: 1.2 };
    if (level === 0.618) return { stroke: "rgba(8,145,178,0.82)", label: "rgba(34,211,238,0.92)", width: 1.1 };
    /* ALL interior levels — uniform teal/cyan (matches fragment sheet) */
    return { stroke: "rgba(45,212,191,0.60)", label: "rgba(125,238,226,0.82)", width: 0.9 };
  }
  /* Paper */
  if (isBoundary) return { stroke: "rgba(161,98,7,0.92)", label: "rgba(133,77,14,0.98)", width: 1.3 };
  if (level === 0.5) return { stroke: "rgba(8,145,178,0.88)", label: "rgba(8,145,178,0.98)", width: 1.2 };
  if (level === 0.618) return { stroke: "rgba(14,116,144,0.82)", label: "rgba(14,116,144,0.95)", width: 1.1 };
  return { stroke: "rgba(0,80,65,0.82)", label: "rgba(0,65,50,0.95)", width: 1.0 };
}

/** Diagonal line colour — cyan/teal to match interior fib levels
 *  (as shown in the fragment sheet reference). */
function diagonalColor(dark: boolean) {
  return dark ? "rgba(45,212,191,0.55)" : "rgba(0,80,65,0.65)";
}

/**
 * Interactive Fibonacci retracement layer — TradingView / broker-style:
 * - SOLID horizontal levels (green/teal interior, gold boundary)
 * - SOLID diagonal trendline corner-to-corner (purple accent)
 * - % and price labels on the RIGHT
 * - Two always-visible drag handles at diagonal endpoints
 * - Freely draggable, resizable, flippable
 */
export function FibAnnotationLayer({
  annotations,
  canvasRef,
  digits,
  onUpdate,
  onRemove,
  futureProjectionX = null,
  isDark = true,
}: Props) {
  const textStroke = isDark ? "rgba(0,0,0,0.55)" : "rgba(215,214,208,0.65)";
  const handleFill = isDark ? "rgba(34,211,238,0.95)" : "rgba(0,100,120,0.95)";
  const handleStroke = isDark ? "rgba(255,255,255,0.85)" : "rgba(60,55,50,0.85)";
  const handleFillInactive = isDark ? "rgba(34,211,238,0.50)" : "rgba(0,100,120,0.50)";
  const handleStrokeInactive = isDark ? "rgba(255,255,255,0.45)" : "rgba(60,55,50,0.45)";
  const gripFill = isDark ? "rgba(0,0,0,0.55)" : "rgba(215,214,208,0.55)";
  const gripStroke = isDark ? "rgba(255,255,255,0.18)" : "rgba(60,55,50,0.18)";
  const gripLabel = isDark ? "rgba(232,238,246,0.92)" : "rgba(30,25,20,0.92)";

  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<FibGeom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [axisWidth, setAxisWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    annotationId: string;
    handle: 0 | 1 | "body";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originPoints: AnnotationPoint[];
  } | null>(null);

  /* ── Container size ──────────────────────────────────────────── */
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

  /* ── Axis width tracking ─────────────────────────────────────── */
  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    const update = () => setAxisWidth(handle.getRightAxisWidth());
    update();
    return handle.subscribeViewport(update);
  }, [canvasRef]);

  /* ── Geometry computation ─────────────────────────────────────── */
  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;

    function compute() {
      const h = canvasRef.current;
      const host = hostRef.current;
      if (!h) { setGeoms([]); return; }
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
        const extendLeft = Boolean(settings.extendLeft);
        const style: "levels" | "premium_discount" =
          settings.style === "premium_discount" ? "premium_discount" : "levels";
        const locked = Boolean(settings.locked);

        // Right-edge: extend past live candle when enabled
        let rightX = endX;
        if (extend) {
          const projectionEdge =
            futureProjectionX != null && futureProjectionX > endX
              ? Math.min(futureProjectionX, hostWidth - RIGHT_RAIL_OFFSET)
              : hostWidth - RIGHT_RAIL_OFFSET;
          rightX = Math.max(endX, projectionEdge);
        }

        // Diagonal geometry: follows A→B draw direction (like TradingView).
        // Point A = first drawn point, Point B = second drawn point.
        const diagAX = xA;
        const diagAY = yA;
        const diagBX = xB;
        const diagBY = yB;

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
          extendLeft,
          style,
          diagAX,
          diagAY,
          diagBX,
          diagBY,
          locked,
        });
      }
      setGeoms(next);
    }

    compute();
    const unsubscribe = handle.subscribeViewport(compute);
    return unsubscribe;
  }, [annotations, canvasRef, futureProjectionX]);

  /* ── Deselect on outside tap ─────────────────────────────────── */
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
    if (annotations.some((a) => a.id === activeId)) return;
    setActiveId(null);
  }, [activeId, annotations]);

  /* ── Drag handling ───────────────────────────────────────────── */
  function stopChartPointer(e: React.PointerEvent<SVGElement>) {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation?.();
  }

  function startDrag(e: React.PointerEvent<SVGElement>, annotationId: string, handleIdx: 0 | 1 | "body") {
    stopChartPointer(e);
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann || ann.type !== "fib_retracement") return;
    const settings = (ann.settings ?? {}) as Record<string, unknown>;
    const locked = Boolean(settings.locked);
    if (activeId !== annotationId) {
      setActiveId(annotationId);
      return;
    }
    if (locked) return;
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
    if (!drag || drag.pointerId !== e.pointerId) return;
    stopChartPointer(e);
    dragRef.current = null;
    setIsDragging(false);
  }

  /* ── Early returns ───────────────────────────────────────────── */
  if (containerSize.w === 0 || containerSize.h === 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }
  if (geoms.length === 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  /* ── Render ──────────────────────────────────────────────────── */
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
        style={{
          touchAction: isDragging || activeId ? "none" : "manipulation",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        {geoms.map((g) => {
          const isActive = activeId === g.id;
          const eqLine = g.lines.find((ln) => ln.level === 0.5);
          const anchorLine = g.lines.find((ln) => ln.level === 0);
          const swingExtreme = g.lines.find((ln) => ln.level === 1);

          /* Label X positions: % and price both on the right with clear gap */
          const priceLabelX = g.rightX - 4;
          const pctLabelX = priceLabelX - 52;

          /* Remove pill near top-left corner */
          const removeX = Math.max(6, g.startX - 36);
          const removeY = Math.max(6, Math.min(g.anchorY, g.swingY) - 36);

          /* Premium / discount visible lines */
          const visibleLines =
            g.style === "premium_discount"
              ? g.lines.filter((ln) => ln.level === 0 || ln.level === 0.5 || ln.level === 1)
              : g.lines;

          /* Premium / Discount band geometry */
          const topY = anchorLine && swingExtreme ? Math.min(anchorLine.y, swingExtreme.y) : 0;
          const botY = anchorLine && swingExtreme ? Math.max(anchorLine.y, swingExtreme.y) : 0;
          const totalH = Math.max(0, botY - topY);
          const bandH = Math.max(2, totalH * 0.25);
          const premiumFill = isDark ? "rgba(244,63,94,0.045)" : "rgba(150,18,35,0.06)";
          const premiumStroke = isDark ? "rgba(244,63,94,0.30)" : "rgba(150,18,35,0.38)";
          const discountFill = isDark ? "rgba(45,212,191,0.05)" : "rgba(0,100,85,0.06)";
          const discountStroke = isDark ? "rgba(45,212,191,0.30)" : "rgba(0,100,85,0.38)";

          return (
            <g key={g.id}>
              {/* Premium / Discount bands (only in that style mode) */}
              {g.style === "premium_discount" && anchorLine && swingExtreme && totalH > 0 ? (
                <g pointerEvents="none">
                  <rect x={g.startX} y={topY} width={Math.max(2, g.rightX - g.startX)} height={bandH}
                    fill={premiumFill} stroke={premiumStroke} strokeWidth={0.6} strokeDasharray="3 3" />
                  <rect x={g.startX} y={botY - bandH} width={Math.max(2, g.rightX - g.startX)} height={bandH}
                    fill={discountFill} stroke={discountStroke} strokeWidth={0.6} strokeDasharray="3 3" />
                  <text x={g.rightX - 4} y={topY + bandH / 2 + 3} textAnchor="end"
                    fontFamily="ui-sans-serif, system-ui" fontSize="9" fontWeight={700} letterSpacing="0.5"
                    fill={isDark ? "rgba(252,165,165,0.85)" : "rgba(130,10,25,0.90)"}
                    stroke={textStroke} strokeWidth="2" paintOrder="stroke">PREMIUM</text>
                  <text x={g.rightX - 4} y={botY - bandH / 2 + 3} textAnchor="end"
                    fontFamily="ui-sans-serif, system-ui" fontSize="9" fontWeight={700} letterSpacing="0.5"
                    fill={isDark ? "rgba(167,243,208,0.85)" : "rgba(0,80,65,0.90)"}
                    stroke={textStroke} strokeWidth="2" paintOrder="stroke">DISCOUNT</text>
                  {eqLine ? (
                    <text x={g.rightX - 4} y={eqLine.y - 2} textAnchor="end"
                      fontFamily="ui-sans-serif, system-ui" fontSize="8.5" fontWeight={600} letterSpacing="0.4"
                      fill={isDark ? "rgba(148,163,184,0.85)" : "rgba(40,45,55,0.90)"}
                      stroke={textStroke} strokeWidth="2" paintOrder="stroke">EQ</text>
                  ) : null}
                </g>
              ) : null}

              {/* ── Diagonal trendline (A→B draw direction) ────────
                  Follows the actual draw direction like TradingView. */}
              <line
                x1={g.diagAX} y1={g.diagAY}
                x2={g.diagBX} y2={g.diagBY}
                stroke={diagonalColor(isDark)}
                strokeWidth={1.3}
                pointerEvents="none"
                opacity={0.80}
              />

              {/* ── SOLID horizontal level lines ───────────────────
                  Matching the reference: solid lines spanning the
                  full fib width, % label LEFT, price label RIGHT. */}
              {visibleLines.map((ln) => {
                const isFocus = ln.level === 0.5 || ln.level === 0.618;
                const style = fibLevelStyle(ln.level, isDark);
                return (
                  <g key={ln.level}>
                    {/* Invisible wide hit area for body drag — 36px
                        for comfortable touch on narrow portrait screens */}
                    <line
                      x1={g.startX} x2={g.rightX} y1={ln.y} y2={ln.y}
                      stroke="transparent" strokeWidth={36}
                      pointerEvents="stroke"
                      onPointerDown={(e) => startDrag(e, g.id, "body")}
                      style={{ cursor: "move", touchAction: "none" }}
                    />
                    {/* Visible SOLID level line */}
                    <line
                      x1={g.startX} x2={g.rightX} y1={ln.y} y2={ln.y}
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      pointerEvents="none"
                    />
                    {/* % label — right side, spaced from price pill */}
                    <text
                      x={pctLabelX} y={ln.y - 3}
                      textAnchor="end"
                      fontFamily="ui-sans-serif, system-ui, -apple-system"
                      fontSize="10"
                      fontWeight={isFocus ? 650 : 500}
                      fill={style.label}
                      stroke={textStroke} strokeWidth="2.5" paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {(ln.level * 100).toFixed(1)}%
                    </text>
                    {/* Price label — RIGHT side of the line */}
                    <text
                      x={priceLabelX} y={ln.y - 3}
                      textAnchor="end"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      fontSize="10"
                      fontWeight={isFocus ? 650 : 500}
                      fill={style.label}
                      stroke={textStroke} strokeWidth="2.5" paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {ln.price.toFixed(digits)}
                    </text>
                  </g>
                );
              })}

              {/* Drag handles only when selected: avoids accidental
                  repositioning and mirrors MT5-like "tap to arm". */}
              {isActive ? (
              <g style={{ pointerEvents: "auto" }}>
                {/* Point A handle (index 0) */}
                <circle cx={g.diagAX} cy={g.diagAY} r={28}
                  fill="transparent" pointerEvents="all"
                  onPointerDown={(e) => startDrag(e, g.id, 0)}
                  style={{ cursor: "grab", touchAction: "none" }} />
                <circle cx={g.diagAX} cy={g.diagAY}
                  r={isActive ? 8 : 5}
                  fill={isActive ? handleFill : handleFillInactive}
                  stroke={isActive ? handleStroke : handleStrokeInactive}
                  strokeWidth={isActive ? 1.5 : 1}
                  pointerEvents="none" />

                {/* Point B handle (index 1) */}
                <circle cx={g.diagBX} cy={g.diagBY} r={28}
                  fill="transparent" pointerEvents="all"
                  onPointerDown={(e) => startDrag(e, g.id, 1)}
                  style={{ cursor: "grab", touchAction: "none" }} />
                <circle cx={g.diagBX} cy={g.diagBY}
                  r={isActive ? 8 : 5}
                  fill={isActive ? handleFill : handleFillInactive}
                  stroke={isActive ? handleStroke : handleStrokeInactive}
                  strokeWidth={isActive ? 1.5 : 1}
                  pointerEvents="none" />
              </g>
              ) : null}

              {/* Locked badge — always visible so you know the drawing is pinned */}
              {g.locked ? (
                <g pointerEvents="none">
                  <rect
                    x={removeX - 30}
                    y={removeY - 18}
                    width={58}
                    height={15}
                    rx={3}
                    fill={gripFill}
                    stroke={gripStroke}
                  />
                  <text
                    x={removeX - 1}
                    y={removeY - 7}
                    textAnchor="middle"
                    fontFamily="ui-sans-serif, system-ui"
                    fontSize="8.5"
                    fontWeight={700}
                    letterSpacing="0.6"
                    fill={gripLabel}
                  >
                    LOCKED
                  </text>
                </g>
              ) : null}

              {/* Lock + remove controls — only when active */}
              {isActive ? (
                <>
                  <g
                    style={{ pointerEvents: "auto", cursor: "pointer" }}
                    onPointerDown={(e) => {
                      stopChartPointer(e);
                      const ann = annotations.find((a) => a.id === g.id);
                      if (!ann || ann.type !== "fib_retracement") return;
                      const settings = (ann.settings ?? {}) as Record<string, unknown>;
                      const locked = Boolean(settings.locked);
                      onUpdate({
                        ...ann,
                        settings: { ...settings, locked: !locked },
                        updatedAt: new Date().toISOString(),
                      });
                    }}
                  >
                    <rect x={removeX - 30} y={removeY} width={26} height={18} rx={4}
                      fill={gripFill} stroke={gripStroke} />
                    <LockIconSvg locked={g.locked} x={removeX - 17} y={removeY + 9} size={13} fill={gripLabel} />
                  </g>
                  {onRemove ? (
                    <g
                      style={{ pointerEvents: "auto", cursor: "pointer" }}
                      onPointerDown={(e) => { stopChartPointer(e); onRemove(g.id); }}
                    >
                      <rect x={removeX} y={removeY} width={26} height={18} rx={4}
                        fill={gripFill} stroke={gripStroke} />
                      <text x={removeX + 13} y={removeY + 13} textAnchor="middle"
                        fontFamily="ui-sans-serif, system-ui" fontSize="11" fontWeight={600} fill={gripLabel}>✕</text>
                    </g>
                  ) : null}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
