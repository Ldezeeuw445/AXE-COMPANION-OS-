"use client";

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
import { estimateSlTpPnlUsd, formatSlTpPnlUsd } from "@/lib/broker/symbolFormat";

/** Compute estimated USD profit/loss for TP/SL labels via contract-size math. */
export function slTpInfo(
  entryPrice: number | null,
  levelPrice: number | null,
  volume: string | number,
  side: "buy" | "sell",
  _digits: number,
  symbol: string,
): { label: string } | null {
  if (entryPrice == null || levelPrice == null) return null;
  const vol = typeof volume === "string" ? parseFloat(volume) || 0 : volume;
  const usd = estimateSlTpPnlUsd(symbol, entryPrice, levelPrice, vol, side);
  return { label: formatSlTpPnlUsd(usd) };
}

export const TradePlanLine = memo(function TradePlanLine({
  canvasRef,
  price,
  label,
  color,
  digits,
  symbol = "",
  onChange,
  dashed = false,
  entryPrice = null,
  volume = "0",
  side = "buy",
  onDragStart,
  onDragEnd,
  disabled = false,
  zIndex = 24,
  /** Broker pending orders: hide drag ball until the trader taps the line (MT5-style). */
  tapToArm = false,
}: {
  canvasRef: RefObject<ChartCanvasHandle | null>;
  price: number | null;
  label: string;
  color: string;
  digits: number;
  symbol?: string;
  onChange: (price: number) => void;
  dashed?: boolean;
  entryPrice?: number | null;
  volume?: string | number;
  side?: "buy" | "sell";
  onDragStart?: () => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  zIndex?: number;
  tapToArm?: boolean;
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
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const digitsRef = useRef(digits);
  digitsRef.current = digits;
  const dashedRef = useRef(dashed);
  dashedRef.current = dashed;
  const entryPriceRef = useRef(entryPrice);
  entryPriceRef.current = entryPrice;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const sideRef = useRef(side);
  sideRef.current = side;
  const labelPropRef = useRef(label);
  labelPropRef.current = label;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

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
        const by = price == null ? null : handle.priceToCoordinate(price);
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

  const y = baseY;

  const applyLineY = useCallback((nextY: number) => {
    groupRef.current?.setAttribute("transform", `translate(0,${nextY})`);
    if (handleDivRef.current) {
      handleDivRef.current.style.top = `${nextY - 28}px`;
    }
  }, []);

  useLayoutEffect(() => {
    if (isDraggingRef.current || y == null) return;
    applyLineY(y);
  }, [y, applyLineY, size.w, size.h]);

  const disarm = useCallback(() => {
    if (isDraggingRef.current) return;
    setArmed(false);
  }, []);

  useEffect(() => {
    if (!tapToArm || !armed) return;
    const onDocDown = (ev: PointerEvent) => {
      const host = hostRef.current;
      if (!host || host.contains(ev.target as Node)) return;
      disarm();
    };
    document.addEventListener("pointerdown", onDocDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDocDown, { capture: true });
  }, [armed, disarm, tapToArm]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabledRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      dragPriceRef.current = null;

      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      originRef.current = {
        pointerY: e.clientY,
        baseY: baseYRef.current ?? 0,
      };

      if (circleRef.current) {
        circleRef.current.setAttribute("r", "7");
        circleRef.current.setAttribute("stroke-width", "2");
        circleRef.current.setAttribute("fill-opacity", "0.2");
      }

      onDragStartRef.current?.();

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
            priceTextRef.current.textContent = newPrice.toFixed(digitsRef.current);
          }
          if (labelTextRef.current && dashedRef.current) {
            const info = slTpInfo(
              entryPriceRef.current,
              newPrice,
              volumeRef.current,
              sideRef.current,
              digitsRef.current,
              symbolRef.current,
            );
            labelTextRef.current.textContent = info
              ? `${labelPropRef.current.toUpperCase()}, ${info.label}`
              : labelPropRef.current.toUpperCase();
          } else if (labelTextRef.current && !dashedRef.current) {
            labelTextRef.current.textContent = `${labelPropRef.current.toUpperCase()} ${volumeRef.current}`;
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
        if (tapToArm) setArmed(false);
        if (finalPrice != null) onChangeRef.current(finalPrice);
        onDragEndRef.current?.();
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("lostpointercapture", onUp);
    },
    [applyLineY, canvasRef, tapToArm],
  );

  const handleArmPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabledRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setArmed(true);

      const el = e.currentTarget;
      const originY = e.clientY;
      let dragging = false;

      const onMove = (ev: PointerEvent) => {
        if (dragging) return;
        if (Math.abs(ev.clientY - originY) < 6) return;
        dragging = true;
        handlePointerDown({
          ...e,
          clientY: originY,
          currentTarget: el,
          pointerId: ev.pointerId,
          preventDefault: () => ev.preventDefault(),
          stopPropagation: () => ev.stopPropagation(),
        } as React.PointerEvent<HTMLDivElement>);
      };

      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointermove", onMove, { passive: false });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [handlePointerDown],
  );

  if (price == null || y == null || size.w <= 0 || size.h <= 0) {
    return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  const plotRight = Math.max(0, size.w - Math.max(axisWidth, 56));
  const info = dashed ? slTpInfo(entryPrice, price, volume, side, digits, symbol) : null;
  const labelText = info ? `${label.toUpperCase()}, ${info.label}` : label.toUpperCase();
  const priceText = price.toFixed(digits);
  const labelPixels = Math.max(40, labelText.length * 5.5 + 8);
  const priceWidth = Math.max(58, axisWidth - 4);
  const priceX = size.w - priceWidth - 2;
  const handleCx = (labelPixels + 4 + plotRight) / 2;
  const showDragHandle = !tapToArm || armed;

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0"
      style={{
        zIndex,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "none",
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="absolute inset-0"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      >
        <g ref={groupRef}>
          <line
            x1={labelPixels + 4}
            x2={plotRight}
            y1={0}
            y2={0}
            stroke={color}
            strokeWidth={dashed ? 1 : 1.5}
            strokeDasharray={dashed ? "6 4" : ""}
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

          {showDragHandle ? (
            <circle
              ref={circleRef}
              cx={handleCx}
              cy={0}
              r={5}
              fill={color}
              fillOpacity={0}
              stroke={color}
              strokeWidth={1.5}
              style={{ pointerEvents: "none" }}
            />
          ) : null}

          <g style={{ pointerEvents: "none" }}>
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

      {showDragHandle ? (
        <div
          ref={handleDivRef}
          onPointerDown={handlePointerDown}
          style={{
            position: "absolute",
            left: handleCx - 28,
            top: y - 28,
            width: 56,
            height: 56,
            pointerEvents: disabled ? "none" : "auto",
            touchAction: "none",
            cursor: disabled ? "default" : "ns-resize",
            opacity: disabled ? 0 : 1,
          }}
        />
      ) : (
        <div
          onPointerDown={handleArmPointerDown}
          style={{
            position: "absolute",
            left: 0,
            top: y - 16,
            width: Math.max(labelPixels + 12, plotRight),
            height: 32,
            pointerEvents: disabled ? "none" : "auto",
            touchAction: "manipulation",
            cursor: disabled ? "default" : "pointer",
            zIndex: zIndex + 1,
          }}
          aria-label={`Tap to adjust ${label}`}
        />
      )}
    </div>
  );
}, (prev, next) =>
  prev.price === next.price &&
  prev.label === next.label &&
  prev.color === next.color &&
  prev.digits === next.digits &&
  prev.dashed === next.dashed &&
  prev.entryPrice === next.entryPrice &&
  prev.volume === next.volume &&
  prev.side === next.side &&
  prev.disabled === next.disabled &&
  prev.tapToArm === next.tapToArm &&
  prev.canvasRef === next.canvasRef &&
  prev.symbol === next.symbol,
);
