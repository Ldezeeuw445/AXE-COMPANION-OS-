"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { AnnotationPoint, ChartAnnotation } from "@/components/chart/annotations/types";

type Props = {
  annotations: ChartAnnotation[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  onUpdate: (annotation: ChartAnnotation) => void;
  onRemove?: (annotationId: string) => void;
  isDark?: boolean;
};

type RectGeom = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function strokeColor(isActive: boolean, dark: boolean): string {
  if (dark) return isActive ? "rgba(34,211,238,0.92)" : "rgba(110,178,252,0.78)";
  return isActive ? "rgba(0,100,120,0.95)" : "rgba(20,60,140,0.82)";
}

function fillColor(dark: boolean): string {
  return dark ? "rgba(34,211,238,0.08)" : "rgba(0,100,120,0.10)";
}

export function RectangleAnnotationLayer({
  annotations,
  canvasRef,
  onUpdate,
  onRemove,
  isDark = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<RectGeom[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastSeenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(annotations.filter((a) => a.type === "rectangle").map((a) => a.id));
    let newest: string | null = null;
    for (const id of ids) {
      if (!lastSeenIdsRef.current.has(id)) newest = id;
    }
    lastSeenIdsRef.current = ids;
    if (newest) setActiveId(newest);
  }, [annotations]);

  useEffect(() => {
    if (!activeId) return;
    function deselect(event: PointerEvent) {
      const host = hostRef.current;
      const target = event.target;
      if (!host || !(target instanceof Node) || host.contains(target)) return;
      setActiveId(null);
    }
    window.addEventListener("pointerdown", deselect, true);
    return () => window.removeEventListener("pointerdown", deselect, true);
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
      if (!h) {
        setGeoms([]);
        return;
      }
      const rects = annotations.filter((a) => a.type === "rectangle" && a.points.length >= 2);
      const next: RectGeom[] = [];
      for (const ann of rects) {
        const a = ann.points[0];
        const b = ann.points[1];
        const xA = h.timeToCoordinate(a.time);
        const xB = h.timeToCoordinate(b.time);
        const yA = h.priceToCoordinate(a.price);
        const yB = h.priceToCoordinate(b.price);
        if (xA == null || xB == null || yA == null || yB == null) continue;
        next.push({
          id: ann.id,
          x: Math.min(xA, xB),
          y: Math.min(yA, yB),
          w: Math.max(4, Math.abs(xB - xA)),
          h: Math.max(4, Math.abs(yB - yA)),
        });
      }
      setGeoms(next);
    }

    compute();
    return handle.subscribeViewport(compute);
  }, [annotations, canvasRef]);

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
    if (!ann || ann.type !== "rectangle") return;
    if (activeId !== annotationId) {
      setActiveId(annotationId);
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      annotationId,
      handle: handleIdx,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPoints: ann.points.map((p) => ({ ...p })),
    };
    setIsDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    stopChartPointer(e);
    const handle = canvasRef.current;
    const host = hostRef.current;
    if (!handle || !host) return;
    const ann = annotations.find((a) => a.id === drag.annotationId);
    if (!ann || ann.type !== "rectangle") return;

    let nextPoints: AnnotationPoint[];
    if (drag.handle === "body") {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      nextPoints = drag.originPoints.map((point) => {
        const ox = handle.timeToCoordinate(point.time);
        const oy = handle.priceToCoordinate(point.price);
        if (ox == null || oy == null) return point;
        const nextTime = handle.coordinateToTime(ox + dx);
        const nextPrice = handle.coordinateToPrice(oy + dy);
        if (nextTime == null || nextPrice == null) return point;
        return { time: nextTime, price: nextPrice };
      });
    } else {
      const rect = host.getBoundingClientRect();
      const time = handle.coordinateToTime(e.clientX - rect.left);
      const price = handle.coordinateToPrice(e.clientY - rect.top);
      if (time == null || price == null) return;
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

  if (containerSize.w === 0 || geoms.length === 0) {
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
        style={{
          touchAction: isDragging || activeId ? "none" : "manipulation",
          userSelect: "none",
        }}
      >
        {geoms.map((g) => {
          const isActive = activeId === g.id;
          const color = strokeColor(isActive, isDark);
          const cx = g.x + g.w / 2;
          const cy = g.y + g.h / 2;
          return (
            <g key={g.id}>
              <rect
                x={g.x}
                y={g.y}
                width={g.w}
                height={g.h}
                fill={fillColor(isDark)}
                stroke="transparent"
                strokeWidth={24}
                pointerEvents="all"
                onPointerDown={(e) => startDrag(e, g.id, "body")}
                style={{ cursor: "move", touchAction: "none" }}
              />
              <rect
                x={g.x}
                y={g.y}
                width={g.w}
                height={g.h}
                fill={fillColor(isDark)}
                stroke={color}
                strokeWidth={isActive ? 2 : 1.5}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
              {isActive ? (
                <>
                  <circle
                    cx={g.x}
                    cy={g.y}
                    r={24}
                    fill="transparent"
                    pointerEvents="all"
                    onPointerDown={(e) => startDrag(e, g.id, 0)}
                    style={{ cursor: "grab", touchAction: "none" }}
                  />
                  <circle cx={g.x} cy={g.y} r={7} fill={color} pointerEvents="none" />
                  <circle
                    cx={g.x + g.w}
                    cy={g.y + g.h}
                    r={24}
                    fill="transparent"
                    pointerEvents="all"
                    onPointerDown={(e) => startDrag(e, g.id, 1)}
                    style={{ cursor: "grab", touchAction: "none" }}
                  />
                  <circle cx={g.x + g.w} cy={g.y + g.h} r={7} fill={color} pointerEvents="none" />
                  {onRemove ? (
                    <g
                      style={{ pointerEvents: "auto", cursor: "pointer" }}
                      onPointerDown={(e) => {
                        stopChartPointer(e);
                        onRemove(g.id);
                      }}
                    >
                      <rect
                        x={cx - 13}
                        y={cy - 22}
                        width={26}
                        height={18}
                        rx={4}
                        fill={isDark ? "rgba(0,0,0,0.55)" : "rgba(215,214,208,0.55)"}
                      />
                      <text
                        x={cx}
                        y={cy - 10}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight={600}
                        fill={isDark ? "rgba(232,238,246,0.92)" : "rgba(30,25,20,0.92)"}
                      >
                        ✕
                      </text>
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
