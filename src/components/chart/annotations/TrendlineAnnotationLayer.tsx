"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { AnnotationPoint, ChartAnnotation } from "@/components/chart/annotations/types";

type Props = {
  annotations: ChartAnnotation[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  onUpdate: (annotation: ChartAnnotation) => void;
  onRemove?: (annotationId: string) => void;
};

type TrendGeom = {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

export function TrendlineAnnotationLayer({
  annotations,
  canvasRef,
  onUpdate,
  onRemove,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<TrendGeom[]>([]);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);

  const dragRef = useRef<{
    annotationId: string;
    handle: 0 | 1;
    pointerId: number;
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
      const lines = annotations.filter((a) => a.type === "trendline" && a.points.length >= 2);
      const next: TrendGeom[] = [];
      for (const ann of lines) {
        const a = ann.points[0];
        const b = ann.points[1];
        const xA = h.timeToCoordinate(a.time);
        const xB = h.timeToCoordinate(b.time);
        const yA = h.priceToCoordinate(a.price);
        const yB = h.priceToCoordinate(b.price);
        if (xA == null || xB == null || yA == null || yB == null) continue;
        next.push({ id: ann.id, ax: xA, ay: yA, bx: xB, by: yB });
      }
      setGeoms(next);
    }

    compute();
    const unsubscribe = handle.subscribeViewport(compute);
    return unsubscribe;
  }, [annotations, canvasRef]);

  function startDrag(e: React.PointerEvent<SVGCircleElement>, annotationId: string, handleIdx: 0 | 1) {
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { annotationId, handle: handleIdx, pointerId: e.pointerId };
    setActiveId(annotationId);
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
    if (!ann || ann.type !== "trendline") return;

    const nextPoints: AnnotationPoint[] = [...ann.points] as AnnotationPoint[];
    nextPoints[drag.handle] = { time, price };
    onUpdate({ ...ann, points: nextPoints, updatedAt: new Date().toISOString() });
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = null;
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
          const mx = (g.ax + g.bx) / 2;
          const my = (g.ay + g.by) / 2;
          return (
            <g key={g.id}>
              <line
                x1={g.ax}
                y1={g.ay}
                x2={g.bx}
                y2={g.by}
                stroke={isActive ? "rgba(34,211,238,0.92)" : "rgba(110,178,252,0.78)"}
                strokeWidth={isActive ? 2.4 : 2}
                strokeLinecap="round"
                pointerEvents="none"
              />

              <g style={{ pointerEvents: "auto" }}>
                <circle
                  cx={g.ax}
                  cy={g.ay}
                  r={isActive ? 8 : 6.5}
                  fill="rgba(34,211,238,0.95)"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.5}
                  onPointerDown={(e) => startDrag(e, g.id, 0)}
                  style={{ cursor: "grab" }}
                />
                <circle
                  cx={g.bx}
                  cy={g.by}
                  r={isActive ? 8 : 6.5}
                  fill="rgba(34,211,238,0.95)"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.5}
                  onPointerDown={(e) => startDrag(e, g.id, 1)}
                  style={{ cursor: "grab" }}
                />
              </g>

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
                    x={mx - 10}
                    y={my - 18}
                    width={20}
                    height={14}
                    rx={3}
                    fill="rgba(0,0,0,0.55)"
                    stroke="rgba(255,255,255,0.18)"
                  />
                  <text
                    x={mx}
                    y={my - 8}
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

