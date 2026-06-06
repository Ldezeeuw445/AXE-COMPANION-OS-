"use client";

/**
 * PositionLabelsOverlay — renders entry / SL / TP labels on the LEFT side
 * of the chart as floating text (no box). SL/TP labels are draggable:
 * drag to reposition, release to call MetaAPI modifyPosition.
 *
 * Uses subscribeViewport from ChartCanvasHandle for efficient Y-coordinate
 * tracking during pan/zoom.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { ChartOverlayRow } from "@/lib/broker/loadChartPageData";
import { CHART_THEME } from "@/components/chart/chartTheme";
import {
  priceDigitsForSymbol,
  pointValueForSymbol,
} from "@/lib/broker/symbolFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LabelItem {
  key: string;
  y: number;
  text: string;
  color: string;
  draggable: boolean;
  /** "sl" | "tp" — used to know which field to modify */
  field?: "sl" | "tp";
  /** position id for the MetaAPI call */
  positionId?: string;
  /** current SL price (to preserve when only TP changes) */
  currentSl?: number | null;
  /** current TP price (to preserve when only SL changes) */
  currentTp?: number | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPnl(profit: number | null | undefined): string {
  if (profit == null) return "";
  const sign = profit >= 0 ? "+" : "";
  return `${sign}${profit.toFixed(2)} USD`;
}

function slTpPnl(
  entryPrice: number | null | undefined,
  levelPrice: number,
  volume: number,
  side: "buy" | "sell",
  symbol: string,
): string {
  if (entryPrice == null || entryPrice <= 0) return "";
  const digits = priceDigitsForSymbol(symbol);
  const pointSize = Math.pow(10, -digits);
  const dist = levelPrice - entryPrice;
  const pointsRaw = Math.round(dist / pointSize);
  const signedPoints = side === "buy" ? pointsRaw : -pointsRaw;
  const pv = pointValueForSymbol(symbol);
  const usd = signedPoints * volume * pv;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${withSpaces}.${decPart} USD`;
}

function entryColor(side: string | null): string {
  if (side === "sell") return CHART_THEME.negativeText;
  if (side === "buy") return CHART_THEME.positiveText;
  return CHART_THEME.entryLine;
}

/* ------------------------------------------------------------------ */
/*  Modify-position API call                                           */
/* ------------------------------------------------------------------ */

async function callModifyPosition(
  brokerAccountId: string,
  positionId: string,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const body: Record<string, unknown> = { brokerAccountId, positionId };
    if (stopLoss != null) body.stopLoss = stopLoss;
    if (takeProfit != null) body.takeProfit = takeProfit;
    const res = await fetch("/api/mt5/modify-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; message?: string };
    return { ok: !!json.ok, message: json.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PositionLabelsOverlay({
  canvasRef,
  overlays,
  symbol,
  brokerAccountId,
  liveTradingEnabled = false,
}: {
  canvasRef: RefObject<ChartCanvasHandle | null>;
  overlays: ChartOverlayRow[];
  symbol: string;
  /** Required for modify-position API calls. */
  brokerAccountId?: string | null;
  /** Drag-to-modify only enabled when live trading is on. */
  liveTradingEnabled?: boolean;
}) {
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  // ── Drag state (ref-based for perf — no React re-renders during drag) ──
  const [dragState, setDragState] = useState<{
    key: string;
    y: number;
    price: number;
    text: string;
    color: string;
  } | null>(null);
  const isDraggingRef = useRef(false);
  const dragDataRef = useRef<{
    key: string;
    field: "sl" | "tp";
    positionId: string;
    currentSl: number | null;
    currentTp: number | null;
    originPointerY: number;
    originLabelY: number;
    entryPrice: number | null;
    volume: number;
    side: "buy" | "sell";
    color: string;
  } | null>(null);

  // ── Build labels from overlays + chart coordinates ──
  const computeLabels = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const next: LabelItem[] = [];

    for (const o of overlaysRef.current) {
      const side = o.side as "buy" | "sell" | null;
      const canDrag = liveTradingEnabled && !!brokerAccountId;

      // Entry label (never draggable)
      if (o.entryPrice != null && o.entryPrice > 0) {
        const y = canvas.priceToCoordinate(o.entryPrice);
        if (y != null) {
          const sideLabel = side?.toUpperCase() ?? "TRADE";
          const pnl = o.profit != null ? `, ${formatPnl(o.profit)}` : "";
          next.push({
            key: `entry-${o.id}`,
            y,
            text: `${sideLabel} ${o.volume}${pnl}`,
            color: entryColor(side),
            draggable: false,
          });
        }
      }

      // SL label (draggable)
      if (o.stopLoss != null && o.stopLoss > 0) {
        const y = canvas.priceToCoordinate(o.stopLoss);
        if (y != null) {
          const pnl = slTpPnl(
            o.entryPrice,
            o.stopLoss,
            o.volume,
            side as "buy" | "sell",
            symbolRef.current,
          );
          next.push({
            key: `sl-${o.id}`,
            y,
            text: `SL${pnl ? `, ${pnl}` : ""}`,
            color: CHART_THEME.stopLine,
            draggable: canDrag,
            field: "sl",
            positionId: o.id,
            currentSl: o.stopLoss,
            currentTp: o.takeProfit,
          });
        }
      }

      // TP label (draggable)
      if (o.takeProfit != null && o.takeProfit > 0) {
        const y = canvas.priceToCoordinate(o.takeProfit);
        if (y != null) {
          const pnl = slTpPnl(
            o.entryPrice,
            o.takeProfit,
            o.volume,
            side as "buy" | "sell",
            symbolRef.current,
          );
          next.push({
            key: `tp-${o.id}`,
            y,
            text: `TP${pnl ? `, ${pnl}` : ""}`,
            color: CHART_THEME.takeLine,
            draggable: canDrag,
            field: "tp",
            positionId: o.id,
            currentSl: o.stopLoss,
            currentTp: o.takeProfit,
          });
        }
      }
    }

    setLabels(next);
  }, [canvasRef, liveTradingEnabled, brokerAccountId]);

  // Subscribe to viewport changes
  useEffect(() => {
    computeLabels();
    const canvas = canvasRef.current;
    if (!canvas) return;
    return canvas.subscribeViewport(computeLabels);
  }, [canvasRef, computeLabels, overlays]);

  // Also recompute when overlays change (new profit values etc)
  useEffect(() => {
    computeLabels();
  }, [overlays, computeLabels]);

  // ── Drag handlers ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, label: LabelItem) => {
      if (!label.draggable || !label.field || !label.positionId) return;
      e.preventDefault();
      e.stopPropagation();

      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;

      // Find the overlay for this position to get entry/volume/side
      const overlay = overlaysRef.current.find((o) => o.id === label.positionId);

      dragDataRef.current = {
        key: label.key,
        field: label.field,
        positionId: label.positionId,
        currentSl: label.currentSl ?? null,
        currentTp: label.currentTp ?? null,
        originPointerY: e.clientY,
        originLabelY: label.y,
        entryPrice: overlay?.entryPrice ?? null,
        volume: overlay?.volume ?? 0,
        side: (overlay?.side as "buy" | "sell") ?? "buy",
        color: label.color,
      };

      setDragState({
        key: label.key,
        y: label.y,
        price: label.field === "sl" ? (label.currentSl ?? 0) : (label.currentTp ?? 0),
        text: label.text,
        color: label.color,
      });
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || !dragDataRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const drag = dragDataRef.current;
      const delta = e.clientY - drag.originPointerY;
      const newY = drag.originLabelY + delta;
      const newPrice = canvas.coordinateToPrice(newY);
      if (newPrice == null || !Number.isFinite(newPrice) || newPrice <= 0) return;

      const digits = priceDigitsForSymbol(symbolRef.current);
      const tag = drag.field === "sl" ? "SL" : "TP";
      const pnl = slTpPnl(
        drag.entryPrice,
        newPrice,
        drag.volume,
        drag.side,
        symbolRef.current,
      );

      setDragState({
        key: drag.key,
        y: newY,
        price: newPrice,
        text: `${tag}${pnl ? `, ${pnl}` : ""} → ${newPrice.toFixed(digits)}`,
        color: drag.color,
      });
    },
    [canvasRef],
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || !dragDataRef.current) return;
      const canvas = canvasRef.current;
      const drag = dragDataRef.current;

      isDraggingRef.current = false;
      dragDataRef.current = null;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch { /* noop */ }

      if (!canvas || !brokerAccountId) {
        setDragState(null);
        return;
      }

      const delta = e.clientY - drag.originPointerY;
      const newY = drag.originLabelY + delta;
      const newPrice = canvas.coordinateToPrice(newY);

      setDragState(null);

      if (newPrice == null || !Number.isFinite(newPrice) || newPrice <= 0) return;

      // Determine what changed
      const newSl = drag.field === "sl" ? newPrice : (drag.currentSl ?? undefined);
      const newTp = drag.field === "tp" ? newPrice : (drag.currentTp ?? undefined);

      const result = await callModifyPosition(
        brokerAccountId,
        drag.positionId,
        newSl,
        newTp,
      );

      if (!result.ok) {
        console.warn("[PositionLabelsOverlay] Modify failed:", result.message);
        // TODO: show toast/feedback to user
      }
    },
    [canvasRef, brokerAccountId],
  );

  const handlePointerCancel = useCallback(() => {
    isDraggingRef.current = false;
    dragDataRef.current = null;
    setDragState(null);
  }, []);

  if (labels.length === 0 && !dragState) return null;

  // dragState !== null is our React-visible "is dragging" flag
  const isDraggingVisible = dragState !== null;

  return (
    <div
      className="absolute inset-0 overflow-hidden z-10"
      style={{
        pointerEvents: isDraggingVisible ? "auto" : "none",
        touchAction: "none",
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {labels.map((label) => {
        // Hide the static label if it's currently being dragged
        if (dragState && dragState.key === label.key) return null;

        return (
          <div
            key={label.key}
            className="absolute left-0 -translate-y-1/2 whitespace-nowrap"
            style={{
              top: label.y,
              pointerEvents: label.draggable ? "auto" : "none",
              touchAction: "none",
            }}
          >
            {/* Drag touch area — wider than visible text for easy grab */}
            {label.draggable ? (
              <div
                className="flex items-center cursor-ns-resize"
                style={{ padding: "12px 8px", margin: "-12px -8px" }}
                onPointerDown={(e) => handlePointerDown(e, label)}
              >
                <span
                  style={{
                    color: label.color,
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    textShadow:
                      "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)",
                    paddingLeft: 6,
                  }}
                >
                  {label.text}
                </span>
              </div>
            ) : (
              <span
                style={{
                  color: label.color,
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  textShadow:
                    "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)",
                  paddingLeft: 6,
                }}
              >
                {label.text}
              </span>
            )}
          </div>
        );
      })}

      {/* Dragging ghost label */}
      {dragState && (
        <div
          className="absolute left-0 -translate-y-1/2 whitespace-nowrap"
          style={{
            top: dragState.y,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              color: dragState.color,
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textShadow:
                "0 0 6px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.9)",
              paddingLeft: 6,
            }}
          >
            {dragState.text}
          </span>
        </div>
      )}
    </div>
  );
}
