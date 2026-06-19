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

type TextGeom = {
  id: string;
  x: number;
  y: number;
  text: string;
};

function labelColor(isActive: boolean, dark: boolean): string {
  if (dark) return isActive ? "rgba(34,211,238,0.98)" : "rgba(167,243,208,0.92)";
  return isActive ? "rgba(0,100,120,0.98)" : "rgba(0,80,65,0.92)";
}

export function TextAnnotationLayer({
  annotations,
  canvasRef,
  onUpdate,
  onRemove,
  isDark = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geoms, setGeoms] = useState<TextGeom[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastSeenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(annotations.filter((a) => a.type === "text").map((a) => a.id));
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
    startClientX: number;
    startClientY: number;
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
      const labels = annotations.filter((a) => a.type === "text" && a.points.length >= 1);
      const next: TextGeom[] = [];
      for (const ann of labels) {
        const p = ann.points[0];
        const x = h.timeToCoordinate(p.time);
        const y = h.priceToCoordinate(p.price);
        if (x == null || y == null) continue;
        const settings = (ann.settings ?? {}) as Record<string, unknown>;
        const text = typeof settings.text === "string" && settings.text.trim() ? settings.text.trim() : "Note";
        next.push({ id: ann.id, x, y, text });
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
    if (!ann || ann.type !== "text") return;
    if (activeId !== annotationId) {
      setActiveId(annotationId);
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      annotationId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
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
    if (!ann || ann.type !== "text") return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    const ox = handle.timeToCoordinate(drag.origin.time);
    const oy = handle.priceToCoordinate(drag.origin.price);
    if (ox == null || oy == null) return;
    const nextTime = handle.coordinateToTime(ox + dx);
    const nextPrice = handle.coordinateToPrice(oy + dy);
    if (nextTime == null || nextPrice == null) return;

    onUpdate({
      ...ann,
      points: [{ time: nextTime, price: nextPrice }],
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

  function editLabel(annotationId: string) {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann || ann.type !== "text") return;
    const settings = (ann.settings ?? {}) as Record<string, unknown>;
    const current = typeof settings.text === "string" ? settings.text : "Note";
    const next = window.prompt("Chart label", current);
    if (next == null || !next.trim()) return;
    onUpdate({
      ...ann,
      settings: { ...settings, text: next.trim() },
      updatedAt: new Date().toISOString(),
    });
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
          const color = labelColor(isActive, isDark);
          return (
            <g key={g.id}>
              <rect
                x={g.x - 8}
                y={g.y - 18}
                width={Math.max(48, g.text.length * 7 + 16)}
                height={28}
                fill="transparent"
                pointerEvents="all"
                onPointerDown={(e) => startDrag(e, g.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  editLabel(g.id);
                }}
                style={{ cursor: "move", touchAction: "none" }}
              />
              <text
                x={g.x}
                y={g.y}
                fontFamily="ui-sans-serif, system-ui, -apple-system"
                fontSize="12"
                fontWeight={700}
                fill={color}
                stroke={isDark ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.75)"}
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {g.text}
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
                    x={g.x + Math.max(40, g.text.length * 7)}
                    y={g.y - 18}
                    width={22}
                    height={18}
                    rx={4}
                    fill={isDark ? "rgba(0,0,0,0.55)" : "rgba(215,214,208,0.55)"}
                  />
                  <text
                    x={g.x + Math.max(51, g.text.length * 7 + 11)}
                    y={g.y - 6}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={600}
                    fill={isDark ? "rgba(232,238,246,0.92)" : "rgba(30,25,20,0.92)"}
                  >
                    ✕
                  </text>
                </g>
              ) : null}
              {isActive ? (
                <g
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onPointerDown={(e) => {
                    stopChartPointer(e);
                    editLabel(g.id);
                  }}
                >
                  <rect
                    x={g.x - 8}
                    y={g.y + 12}
                    width={34}
                    height={16}
                    rx={3}
                    fill={isDark ? "rgba(0,0,0,0.55)" : "rgba(215,214,208,0.55)"}
                  />
                  <text
                    x={g.x + 9}
                    y={g.y + 23}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight={700}
                    letterSpacing="0.4"
                    fill={isDark ? "rgba(232,238,246,0.92)" : "rgba(30,25,20,0.92)"}
                  >
                    EDIT
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
