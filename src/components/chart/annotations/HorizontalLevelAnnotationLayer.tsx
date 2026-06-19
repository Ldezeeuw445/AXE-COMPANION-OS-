"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { AnnotationPoint, ChartAnnotation } from "@/components/chart/annotations/types";

const LEFT_RAIL_OFFSET = 8;
const RIGHT_RAIL_OFFSET = 8;

type Props = {
  annotations: ChartAnnotation[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  onUpdate: (annotation: ChartAnnotation) => void;
  onRemove?: (annotationId: string) => void;
  isDark?: boolean;
};

type LevelGeom = {
  id: string;
  y: number;
  price: number;
  label: string;
};

function lineColor(isActive: boolean, dark: boolean): string {
  if (dark) return isActive ? "rgba(168,180,196,0.95)" : "rgba(148,163,184,0.72)";
  return isActive ? "rgba(60,55,50,0.92)" : "rgba(80,75,70,0.78)";
}

export function HorizontalLevelAnnotationLayer({
  annotations,
  canvasRef,
  onUpdate,
  onRemove,
  isDark = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<LevelGeom[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastSeenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(
      annotations.filter((a) => a.type === "horizontal_level").map((a) => a.id),
    );
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
    pointerId: number;
    origin: AnnotationPoint;
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
      const levels = annotations.filter(
        (a) => a.type === "horizontal_level" && a.points.length >= 1,
      );
      const next: LevelGeom[] = [];
      for (const ann of levels) {
        const p = ann.points[0];
        const y = h.priceToCoordinate(p.price);
        if (y == null) continue;
        const settings = (ann.settings ?? {}) as Record<string, unknown>;
        const label =
          typeof settings.label === "string" && settings.label.trim()
            ? settings.label.trim()
            : "Level";
        next.push({ id: ann.id, y, price: p.price, label });
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

  function startDrag(e: React.PointerEvent<SVGElement>, annotationId: string) {
    stopChartPointer(e);
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann || ann.type !== "horizontal_level") return;
    if (activeId !== annotationId) {
      setActiveId(annotationId);
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      annotationId,
      pointerId: e.pointerId,
      origin: { ...ann.points[0] },
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
    if (!ann || ann.type !== "horizontal_level") return;

    const rect = host.getBoundingClientRect();
    const price = handle.coordinateToPrice(e.clientY - rect.top);
    if (price == null) return;

    onUpdate({
      ...ann,
      points: [{ time: drag.origin.time, price }],
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

  if (containerSize.w === 0 || geoms.length === 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  const lineW = Math.max(0, containerSize.w - RIGHT_RAIL_OFFSET - LEFT_RAIL_OFFSET);

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
          const color = lineColor(isActive, isDark);
          return (
            <g key={g.id}>
              <line
                x1={LEFT_RAIL_OFFSET}
                x2={LEFT_RAIL_OFFSET + lineW}
                y1={g.y}
                y2={g.y}
                stroke="transparent"
                strokeWidth={28}
                pointerEvents="stroke"
                onPointerDown={(e) => startDrag(e, g.id)}
                style={{ cursor: "ns-resize", touchAction: "none" }}
              />
              <line
                x1={LEFT_RAIL_OFFSET}
                x2={LEFT_RAIL_OFFSET + lineW}
                y1={g.y}
                y2={g.y}
                stroke={color}
                strokeWidth={isActive ? 1.8 : 1.2}
                strokeDasharray="5 4"
                pointerEvents="none"
              />
              <text
                x={LEFT_RAIL_OFFSET + 4}
                y={g.y - 4}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="9"
                fontWeight={700}
                fill={color}
                pointerEvents="none"
              >
                {g.label}
              </text>
              {isActive && onRemove ? (
                <g
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onPointerDown={(e) => {
                    stopChartPointer(e);
                    onRemove(g.id);
                  }}
                >
                  <rect
                    x={LEFT_RAIL_OFFSET + lineW - 24}
                    y={g.y - 20}
                    width={22}
                    height={18}
                    rx={4}
                    fill={isDark ? "rgba(0,0,0,0.55)" : "rgba(215,214,208,0.55)"}
                  />
                  <text
                    x={LEFT_RAIL_OFFSET + lineW - 13}
                    y={g.y - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={600}
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
