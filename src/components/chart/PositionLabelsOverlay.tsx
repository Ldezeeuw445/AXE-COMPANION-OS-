"use client";

/**
 * PositionLabelsOverlay — entry / SL / TP labels on the chart left edge.
 *
 * SL/TP are draggable. Default (MT5-style): drag → release → tap arrow on entry
 * to confirm. Optional instant mode (Settings): commit on release.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ArrowRight } from "lucide-react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { ChartOverlayRow, PendingOrderOverlay } from "@/lib/broker/loadChartPageData";
import { CHART_THEME, getChartTheme } from "@/components/chart/chartTheme";
import {
  estimateSlTpPnlUsd,
  formatSlTpPnlUsd,
  priceDigitsForSymbol,
} from "@/lib/broker/symbolFormat";

export type SlTpDraft = {
  stopLoss: number | null;
  takeProfit: number | null;
};

export function slTpDraftKeyForPosition(id: string) {
  return `pos:${id}`;
}

export function slTpDraftKeyForOrder(id: string) {
  return `ord:${id}`;
}

interface LabelItem {
  key: string;
  y: number;
  text: string;
  color: string;
  draggable: boolean;
  field?: "sl" | "tp";
  positionId?: string;
  orderId?: string;
  currentSl?: number | null;
  currentTp?: number | null;
  showConfirm?: boolean;
  confirmTargetKey?: string;
}

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

async function callModifyOrder(
  brokerAccountId: string,
  orderId: string,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const body: Record<string, unknown> = { brokerAccountId, orderId };
    if (stopLoss != null) body.stopLoss = stopLoss;
    if (takeProfit != null) body.takeProfit = takeProfit;
    const res = await fetch("/api/mt5/modify-order", {
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

function slTpPnl(
  entryPrice: number | null | undefined,
  levelPrice: number,
  volume: number,
  side: "buy" | "sell",
  symbol: string,
): string {
  if (entryPrice == null || entryPrice <= 0) return "";
  const usd = estimateSlTpPnlUsd(symbol, entryPrice, levelPrice, volume, side);
  return formatSlTpPnlUsd(usd);
}

function formatPnl(profit: number | null | undefined): string {
  if (profit == null) return "";
  const sign = profit >= 0 ? "+" : "";
  return `${sign}${profit.toFixed(2)} USD`;
}

function entryColor(side: string | null): string {
  if (side === "sell") return CHART_THEME.negativeText;
  if (side === "buy") return CHART_THEME.cyanAccent;
  return CHART_THEME.entryLine;
}

function pnlAwareColor(side: string | null, profit: number | null | undefined): string {
  if (profit != null) {
    return profit >= 0 ? CHART_THEME.cyanAccent : CHART_THEME.negativeText;
  }
  return entryColor(side);
}

export function PositionLabelsOverlay({
  canvasRef,
  overlays,
  pendingOrders = [],
  symbol,
  brokerAccountId,
  liveTradingEnabled = false,
  isDemoAccount = false,
  instantSlTpModify = false,
  slTpDrafts = {},
  onSlTpDraftChange,
  onSlTpDraftClear,
  onDemoModify,
  onModifyFeedback,
  isDark = true,
}: {
  canvasRef: RefObject<ChartCanvasHandle | null>;
  overlays: ChartOverlayRow[];
  pendingOrders?: PendingOrderOverlay[];
  symbol: string;
  brokerAccountId?: string | null;
  liveTradingEnabled?: boolean;
  isDemoAccount?: boolean;
  instantSlTpModify?: boolean;
  slTpDrafts?: Record<string, SlTpDraft>;
  onSlTpDraftChange?: (
    input: SlTpDraft & { key: string; positionId?: string; orderId?: string },
  ) => void;
  onSlTpDraftClear?: (key: string) => void;
  onDemoModify?: (input: {
    positionId: string;
    stopLoss: number | null;
    takeProfit: number | null;
  }) => void;
  onModifyFeedback?: (result: { ok: boolean; message?: string }) => void;
  isDark?: boolean;
}) {
  const theme = isDark ? CHART_THEME : getChartTheme("paper");
  const labelShadow = isDark
    ? "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)"
    : "0 1px 0 rgba(255,255,255,0.82)";
  const dragShadow = isDark
    ? "0 0 6px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.9)"
    : "0 1px 0 rgba(255,255,255,0.88)";

  const [labels, setLabels] = useState<LabelItem[]>([]);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const pendingOrdersRef = useRef(pendingOrders);
  pendingOrdersRef.current = pendingOrders;
  const slTpDraftsRef = useRef(slTpDrafts);
  slTpDraftsRef.current = slTpDrafts;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const [dragState, setDragState] = useState<{
    key: string;
    y: number;
    price: number;
    text: string;
    color: string;
  } | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragDataRef = useRef<{
    key: string;
    field: "sl" | "tp";
    targetKey: string;
    positionId?: string;
    orderId?: string;
    currentSl: number | null;
    currentTp: number | null;
    originPointerY: number;
    originLabelY: number;
    entryPrice: number | null;
    volume: number;
    side: "buy" | "sell";
    color: string;
  } | null>(null);

  const canModify = !!brokerAccountId && (liveTradingEnabled || isDemoAccount);

  const submitModify = useCallback(
    async (input: {
      targetKey: string;
      positionId?: string;
      orderId?: string;
      stopLoss: number | null;
      takeProfit: number | null;
    }) => {
      if (!brokerAccountId) return { ok: false as const, message: "No account" };

      if (isDemoAccount && input.positionId && onDemoModify) {
        onDemoModify({
          positionId: input.positionId,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit,
        });
        onSlTpDraftClear?.(input.targetKey);
        onModifyFeedback?.({ ok: true, message: "Demo SL/TP updated" });
        return { ok: true as const };
      }

      let result: { ok: boolean; message?: string };
      if (input.orderId) {
        result = await callModifyOrder(
          brokerAccountId,
          input.orderId,
          input.stopLoss ?? undefined,
          input.takeProfit ?? undefined,
        );
      } else if (input.positionId) {
        result = await callModifyPosition(
          brokerAccountId,
          input.positionId,
          input.stopLoss ?? undefined,
          input.takeProfit ?? undefined,
        );
      } else {
        return { ok: false as const, message: "Unknown target" };
      }

      if (result.ok) {
        onSlTpDraftClear?.(input.targetKey);
      }
      onModifyFeedback?.(result);
      return result;
    },
    [brokerAccountId, isDemoAccount, onDemoModify, onModifyFeedback, onSlTpDraftClear],
  );

  const computeLabels = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const next: LabelItem[] = [];
    const drafts = slTpDraftsRef.current;

    for (const o of overlaysRef.current) {
      const side = o.side as "buy" | "sell" | null;
      const targetKey = slTpDraftKeyForPosition(o.id);
      const draft = drafts[targetKey];
      const sl = draft?.stopLoss ?? o.stopLoss;
      const tp = draft?.takeProfit ?? o.takeProfit;
      const hasDraft = Boolean(draft);

      if (o.entryPrice != null && o.entryPrice > 0) {
        const y = canvas.priceToCoordinate(o.entryPrice);
        if (y != null) {
          const sideLabel = side?.toUpperCase() ?? "TRADE";
          const pnl = o.profit != null ? `, ${formatPnl(o.profit)}` : "";
          next.push({
            key: `entry-${o.id}`,
            y,
            text: `${sideLabel} ${o.volume}${pnl}`,
            color: pnlAwareColor(side, o.profit),
            draggable: false,
            showConfirm: hasDraft && canModify,
            confirmTargetKey: targetKey,
            positionId: o.id,
            currentSl: sl,
            currentTp: tp,
          });
        }
      }

      if (sl != null && sl > 0) {
        const y = canvas.priceToCoordinate(sl);
        if (y != null) {
          const pnl = slTpPnl(o.entryPrice, sl, o.volume, side as "buy" | "sell", symbolRef.current);
          next.push({
            key: `sl-${o.id}`,
            y,
            text: `SL${pnl ? `, ${pnl}` : ""}${hasDraft ? " · draft" : ""}`,
            color: theme.stopLine,
            draggable: canModify,
            field: "sl",
            positionId: o.id,
            currentSl: sl,
            currentTp: tp,
          });
        }
      }

      if (tp != null && tp > 0) {
        const y = canvas.priceToCoordinate(tp);
        if (y != null) {
          const pnl = slTpPnl(o.entryPrice, tp, o.volume, side as "buy" | "sell", symbolRef.current);
          next.push({
            key: `tp-${o.id}`,
            y,
            text: `TP${pnl ? `, ${pnl}` : ""}${hasDraft ? " · draft" : ""}`,
            color: theme.takeLine,
            draggable: canModify,
            field: "tp",
            positionId: o.id,
            currentSl: sl,
            currentTp: tp,
          });
        }
      }
    }

    for (const o of pendingOrdersRef.current) {
      const side = o.side as "buy" | "sell";
      const typeLabel = o.type.replace(/_/g, " ").toUpperCase();
      const targetKey = slTpDraftKeyForOrder(o.id);
      const draft = drafts[targetKey];
      const sl = draft?.stopLoss ?? o.stopLoss;
      const tp = draft?.takeProfit ?? o.takeProfit;
      const hasDraft = Boolean(draft);

      if (o.openPrice != null && o.openPrice > 0) {
        const y = canvas.priceToCoordinate(o.openPrice);
        if (y != null) {
          next.push({
            key: `pend-entry-${o.id}`,
            y,
            text: `${typeLabel} ${o.volume}`,
            color: entryColor(side),
            draggable: false,
            showConfirm: hasDraft && canModify && !isDemoAccount,
            confirmTargetKey: targetKey,
            orderId: o.id,
            currentSl: sl,
            currentTp: tp,
          });
        }
      }

      if (sl != null && sl > 0) {
        const y = canvas.priceToCoordinate(sl);
        if (y != null) {
          const pnl = slTpPnl(o.openPrice, sl, o.volume, side, symbolRef.current);
          next.push({
            key: `pend-sl-${o.id}`,
            y,
            text: `SL${pnl ? `, ${pnl}` : ""}${hasDraft ? " · draft" : ""}`,
            color: theme.stopLine,
            draggable: canModify && !isDemoAccount,
            field: "sl",
            orderId: o.id,
            currentSl: sl,
            currentTp: tp,
          });
        }
      }

      if (tp != null && tp > 0) {
        const y = canvas.priceToCoordinate(tp);
        if (y != null) {
          const pnl = slTpPnl(o.openPrice, tp, o.volume, side, symbolRef.current);
          next.push({
            key: `pend-tp-${o.id}`,
            y,
            text: `TP${pnl ? `, ${pnl}` : ""}${hasDraft ? " · draft" : ""}`,
            color: theme.takeLine,
            draggable: canModify && !isDemoAccount,
            field: "tp",
            orderId: o.id,
            currentSl: sl,
            currentTp: tp,
          });
        }
      }
    }

    setLabels(next);
  }, [canvasRef, canModify, isDemoAccount, theme.stopLine, theme.takeLine]);

  useEffect(() => {
    computeLabels();
    const canvas = canvasRef.current;
    if (!canvas) return;
    return canvas.subscribeViewport(computeLabels);
  }, [canvasRef, computeLabels, overlays, pendingOrders, slTpDrafts]);

  useEffect(() => {
    computeLabels();
  }, [overlays, slTpDrafts, computeLabels]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, label: LabelItem) => {
      if (!label.draggable || !label.field || (!label.positionId && !label.orderId)) return;
      e.preventDefault();
      e.stopPropagation();

      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;

      const targetKey = label.positionId
        ? slTpDraftKeyForPosition(label.positionId)
        : slTpDraftKeyForOrder(label.orderId!);

      const overlay = label.positionId
        ? overlaysRef.current.find((o) => o.id === label.positionId)
        : null;
      const pendingOrder = label.orderId
        ? pendingOrdersRef.current.find((o) => o.id === label.orderId)
        : null;

      dragDataRef.current = {
        key: label.key,
        field: label.field,
        targetKey,
        positionId: label.positionId,
        orderId: label.orderId,
        currentSl: label.currentSl ?? null,
        currentTp: label.currentTp ?? null,
        originPointerY: e.clientY,
        originLabelY: label.y,
        entryPrice: overlay?.entryPrice ?? pendingOrder?.openPrice ?? null,
        volume: overlay?.volume ?? pendingOrder?.volume ?? 0,
        side: (overlay?.side ?? pendingOrder?.side ?? "buy") as "buy" | "sell",
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
      const pnl = slTpPnl(drag.entryPrice, newPrice, drag.volume, drag.side, symbolRef.current);

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
      } catch {
        /* noop */
      }

      if (!canvas || !brokerAccountId) {
        setDragState(null);
        return;
      }

      const delta = e.clientY - drag.originPointerY;
      const newY = drag.originLabelY + delta;
      const newPrice = canvas.coordinateToPrice(newY);

      setDragState(null);

      if (newPrice == null || !Number.isFinite(newPrice) || newPrice <= 0) return;

      const newSl = drag.field === "sl" ? newPrice : drag.currentSl;
      const newTp = drag.field === "tp" ? newPrice : drag.currentTp;

      if (instantSlTpModify) {
        await submitModify({
          targetKey: drag.targetKey,
          positionId: drag.positionId,
          orderId: drag.orderId,
          stopLoss: newSl,
          takeProfit: newTp,
        });
        return;
      }

      onSlTpDraftChange?.({
        key: drag.targetKey,
        stopLoss: newSl,
        takeProfit: newTp,
        positionId: drag.positionId,
        orderId: drag.orderId,
      });
    },
    [brokerAccountId, canvasRef, instantSlTpModify, onSlTpDraftChange, submitModify],
  );

  const handleConfirm = useCallback(
    async (label: LabelItem) => {
      if (!label.confirmTargetKey || confirmingKey) return;
      const draft = slTpDraftsRef.current[label.confirmTargetKey];
      if (!draft) return;

      setConfirmingKey(label.confirmTargetKey);
      try {
        await submitModify({
          targetKey: label.confirmTargetKey,
          positionId: label.positionId,
          orderId: label.orderId,
          stopLoss: draft.stopLoss,
          takeProfit: draft.takeProfit,
        });
      } finally {
        setConfirmingKey(null);
      }
    },
    [confirmingKey, submitModify],
  );

  const handlePointerCancel = useCallback(() => {
    isDraggingRef.current = false;
    dragDataRef.current = null;
    setDragState(null);
  }, []);

  if (labels.length === 0 && !dragState) return null;

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
        if (dragState && dragState.key === label.key) return null;

        return (
          <div
            key={label.key}
            className="absolute left-0 -translate-y-1/2 whitespace-nowrap"
            style={{
              top: label.y,
              pointerEvents: label.draggable || label.showConfirm ? "auto" : "none",
              touchAction: "none",
            }}
          >
            <div className="flex items-center gap-1">
              {label.showConfirm && label.confirmTargetKey ? (
                <button
                  type="button"
                  onClick={() => void handleConfirm(label)}
                  disabled={confirmingKey === label.confirmTargetKey}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-cyan-400/35 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(0,212,245,0.25)] active:scale-95 disabled:opacity-50"
                  aria-label="Set new SL and TP on broker"
                  title="Set SL / TP (MetaTrader style)"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : null}

              {label.draggable ? (
                <div
                  className="flex cursor-ns-resize items-center"
                  style={{ padding: "12px 8px", margin: "-12px -8px" }}
                  onPointerDown={(e) => handlePointerDown(e, label)}
                >
                  <span
                    style={{
                      color: label.color,
                      fontSize: "10px",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      textShadow: labelShadow,
                      paddingLeft: label.showConfirm ? 0 : 6,
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
                    textShadow: labelShadow,
                    paddingLeft: label.showConfirm ? 0 : 6,
                  }}
                >
                  {label.text}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {dragState ? (
        <div
          className="absolute left-0 -translate-y-1/2 whitespace-nowrap"
          style={{ top: dragState.y, pointerEvents: "none" }}
        >
          <span
            style={{
              color: dragState.color,
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textShadow: dragShadow,
              paddingLeft: 6,
            }}
          >
            {dragState.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
