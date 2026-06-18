"use client";

/**
 * MT5-style SL/TP level for open positions and broker pending orders.
 * Idle: small left label only (chart stays pannable).
 * Tap label → show P&L + drag ball + horizontal line.
 * Release after drag → commit + return to idle line.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import { slTpInfo } from "@/components/chart/TradePlanLine";

export const PositionSlTpLine = memo(function PositionSlTpLine({
  canvasRef,
  price,
  label,
  color,
  digits,
  symbol = "",
  onChange,
  entryPrice = null,
  volume = 0,
  side = "buy",
  disabled = false,
}: {
  canvasRef: RefObject<ChartCanvasHandle | null>;
  price: number;
  label: string;
  color: string;
  digits: number;
  symbol?: string;
  onChange: (price: number) => void;
  entryPrice?: number | null;
  volume?: number;
  side?: "buy" | "sell";
  disabled?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const priceTextRef = useRef<SVGTextElement | null>(null);
  const labelTextRef = useRef<SVGTextElement | null>(null);
  const circleRef = useRef<SVGCircleElement | null>(null);
  const handleDivRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [axisWidth, setAxisWidth] = useState(0);
  const [baseY, setBaseY] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);

  const isDraggingRef = useRef(false);
  const rafRef = useRef(0);
  const baseYRef = useRef<number | null>(null);
  const dragPriceRef = useRef<number | null>(null);
  const originRef = useRef<{ pointerY: number; baseY: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    const compute = () => {
      if (!isDraggingRef.current) {
        const by = handle.priceToCoordinate(price);
        setBaseY(by);
        baseYRef.current = by;
        setAxisWidth(handle.getRightAxisWidth());
      }
    };
    compute();
    return handle.subscribeViewport(compute);
  }, [canvasRef, price]);

  useEffect(
    () => () => {
      isDraggingRef.current = false;
      cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const applyLineY = useCallback((nextY: number) => {
    groupRef.current?.setAttribute("transform", `translate(0,${nextY})`);
    if (handleDivRef.current) {
      handleDivRef.current.style.top = `${nextY - 28}px`;
    }
  }, []);

  useLayoutEffect(() => {
    if (isDraggingRef.current || baseY == null) return;
    applyLineY(baseY);
  }, [baseY, applyLineY, size.w, size.h]);

  const disarm = useCallback(() => {
    if (isDraggingRef.current) return;
    setArmed(false);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const onDocDown = (ev: PointerEvent) => {
      const host = hostRef.current;
      if (!host || host.contains(ev.target as Node)) return;
      disarm();
    };
    document.addEventListener("pointerdown", onDocDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDocDown, { capture: true });
  }, [armed, disarm]);

  const startDragSession = useCallback(
    (el: HTMLElement, pointerId: number, pointerY: number) => {
      isDraggingRef.current = true;
      dragPriceRef.current = null;
      el.setPointerCapture(pointerId);

      originRef.current = {
        pointerY,
        baseY: baseYRef.current ?? 0,
      };

      if (circleRef.current) {
        circleRef.current.setAttribute("r", "7");
        circleRef.current.setAttribute("stroke-width", "2");
        circleRef.current.setAttribute("fill-opacity", "0.2");
      }

      const onMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current) return;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const chartHandle = canvasRef.current;
          const origin = originRef.current;
          if (!chartHandle || !origin) return;

          const delta = ev.clientY - origin.pointerY;
          const newY = origin.baseY + delta;
          const newPrice = chartHandle.coordinateToPrice(newY);
          if (newPrice == null || !Number.isFinite(newPrice)) return;

          applyLineY(newY);
          dragPriceRef.current = newPrice;

          if (priceTextRef.current) {
            priceTextRef.current.textContent = newPrice.toFixed(digits);
          }
          const info = slTpInfo(entryPrice, newPrice, volume, side, digits, symbol);
          if (labelTextRef.current) {
            labelTextRef.current.textContent = info
              ? `${label.toUpperCase()}, ${info.label}`
              : label.toUpperCase();
          }
        });
      };

      const onUp = () => {
        isDraggingRef.current = false;
        cancelAnimationFrame(rafRef.current);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("lostpointercapture", onUp);

        if (circleRef.current) {
          circleRef.current.setAttribute("r", "5");
          circleRef.current.setAttribute("stroke-width", "1.5");
          circleRef.current.setAttribute("fill-opacity", "0");
        }

        const finalPrice = dragPriceRef.current;
        dragPriceRef.current = null;
        originRef.current = null;
        setArmed(false);
        if (finalPrice != null) onChangeRef.current(finalPrice);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("lostpointercapture", onUp);
    },
    [applyLineY, canvasRef, digits, entryPrice, label, side, symbol, volume],
  );

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      startDragSession(e.currentTarget, e.pointerId, e.clientY);
    },
    [disabled, startDragSession],
  );

  /** Tap label to arm — drag starts from the handle zone, not the label itself. */
  const handleLabelPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setArmed(true);
    },
    [disabled],
  );

  if (baseY == null || size.w <= 0 || size.h <= 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  const y = baseY;
  const plotRight = Math.max(0, size.w - Math.max(axisWidth, 56));
  const info = slTpInfo(entryPrice, price, volume, side, digits, symbol);
  const idleLabel = label.toUpperCase();
  const armedLabel = info ? `${label.toUpperCase()}, ${info.label}` : idleLabel;
  const labelText = armed ? armedLabel : idleLabel;
  const labelPixels = Math.max(40, labelText.length * 5.5 + 8);
  const priceWidth = Math.max(58, axisWidth - 4);
  const priceX = size.w - priceWidth - 2;
  const handleCx = (labelPixels + 4 + plotRight) / 2;
  const priceText = price.toFixed(digits);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      {armed ? (
        <>
          <svg
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            className="pointer-events-none absolute inset-0 z-[24]"
          >
            <g ref={groupRef}>
              <line
                x1={labelPixels + 4}
                x2={plotRight}
                y1={0}
                y2={0}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="6 4"
                opacity={0.95}
              />
              <text
                ref={labelTextRef}
                x={4}
                y={3}
                fontFamily="ui-sans-serif, system-ui, -apple-system"
                fontSize={10}
                fontWeight={700}
                fill={color}
              >
                {labelText}
              </text>
              <circle
                ref={circleRef}
                cx={handleCx}
                cy={0}
                r={5}
                fill={color}
                fillOpacity={0}
                stroke={color}
                strokeWidth={1.5}
              />
              <g>
                <rect x={priceX} y={-9} width={priceWidth} height={18} rx={2} fill={color} />
                <text
                  ref={priceTextRef}
                  x={priceX + priceWidth / 2}
                  y={4}
                  textAnchor="middle"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fontSize={10}
                  fontWeight={700}
                  fill="#000"
                >
                  {priceText}
                </text>
              </g>
            </g>
          </svg>
          <div
            ref={handleDivRef}
            onPointerDown={handleDragPointerDown}
            style={{
              position: "absolute",
              left: handleCx - 28,
              top: y - 28,
              width: 56,
              height: 56,
              pointerEvents: "auto",
              touchAction: "none",
              cursor: "ns-resize",
              zIndex: 25,
            }}
          />
        </>
      ) : (
        <div
          className="pointer-events-auto absolute left-0 z-[26] -translate-y-1/2 cursor-pointer select-none"
          style={{ top: y, touchAction: "manipulation" }}
          onPointerDown={handleLabelPointerDown}
        >
          <span
            style={{
              color,
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textShadow: "0 0 4px rgba(0,0,0,0.9)",
              paddingLeft: 6,
              paddingTop: 12,
              paddingBottom: 12,
              paddingRight: 14,
            }}
          >
            {idleLabel}
          </span>
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.price === next.price &&
  prev.label === next.label &&
  prev.color === next.color &&
  prev.digits === next.digits &&
  prev.entryPrice === next.entryPrice &&
  prev.volume === next.volume &&
  prev.side === next.side &&
  prev.disabled === next.disabled &&
  prev.canvasRef === next.canvasRef &&
  prev.symbol === next.symbol,
);
