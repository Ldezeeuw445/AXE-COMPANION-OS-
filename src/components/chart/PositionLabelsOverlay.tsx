"use client";

/**
 * PositionLabelsOverlay — entry labels + draggable SL/TP lines on the chart.
 *
 * SL/TP use the same TradePlanLine drag engine as buy/sell limit lines.
 * Default (MT5-style): drag → release → tap arrow on entry to confirm.
 * Optional instant mode (Settings): commit on release.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight } from "lucide-react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";
import type { ChartOverlayRow, PendingOrderOverlay } from "@/lib/broker/loadChartPageData";
import { CHART_THEME, getChartTheme } from "@/components/chart/chartTheme";
import { PositionSlTpLine } from "@/components/chart/PositionSlTpLine";
import { TradePlanLine } from "@/components/chart/TradePlanLine";
import { priceDigitsForSymbol } from "@/lib/broker/symbolFormat";

export type SlTpDraft = {
  stopLoss: number | null;
  takeProfit: number | null;
  openPrice?: number | null;
};

export function slTpDraftKeyForPosition(id: string) {
  return `pos:${id}`;
}

export function slTpDraftKeyForOrder(id: string) {
  return `ord:${id}`;
}

async function callModifyPosition(
  brokerAccountId: string,
  positionId: string,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
  isAlpacaAccount: boolean,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const endpoint = isAlpacaAccount ? "/api/alpaca/modify-position" : "/api/mt5/modify-position";
    const body: Record<string, unknown> = { brokerAccountId, positionId };
    if (stopLoss != null) body.stopLoss = stopLoss;
    if (takeProfit != null) body.takeProfit = takeProfit;
    const res = await fetch(endpoint, {
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
  fields: {
    openPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
  },
  isAlpacaAccount: boolean,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const endpoint = isAlpacaAccount ? "/api/alpaca/modify-order" : "/api/mt5/modify-order";
    const body: Record<string, unknown> = { brokerAccountId, orderId };
    if (fields.openPrice != null) body.openPrice = fields.openPrice;
    if (fields.stopLoss != null) body.stopLoss = fields.stopLoss;
    if (fields.takeProfit != null) body.takeProfit = fields.takeProfit;
    const res = await fetch(endpoint, {
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
/*  Modify-order API call (pending limit/stop orders)                  */
/* ------------------------------------------------------------------ */

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

async function callCancelOrder(
  brokerAccountId: string,
  orderId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/mt5/cancel-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brokerAccountId, orderId }),
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
  pendingOrders = [],
  symbol,
  brokerAccountId,
  liveTradingEnabled = false,
  isDemoAccount = false,
  isAlpacaAccount = false,
  instantSlTpModify = false,
  slTpDrafts = {},
  onSlTpDraftChange,
  onSlTpDraftClear,
  onDemoModify,
  onDemoOrderModify,
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
  isAlpacaAccount?: boolean;
  instantSlTpModify?: boolean;
  slTpDrafts?: Record<string, SlTpDraft>;
  onSlTpDraftChange?: (
    input: SlTpDraft & { key: string; positionId?: string; orderId?: string; openPrice?: number | null },
  ) => void;
  onSlTpDraftClear?: (key: string) => void;
  onDemoModify?: (input: {
    positionId: string;
    stopLoss: number | null;
    takeProfit: number | null;
  }) => void;
  onDemoOrderModify?: (input: {
    orderId: string;
    openPrice?: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
  }) => void;
  onModifyFeedback?: (result: { ok: boolean; message?: string }) => void;
  isDark?: boolean;
}) {
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [armedPendingOrderId, setArmedPendingOrderId] = useState<string | null>(null);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const pendingOrdersRef = useRef(pendingOrders);
  pendingOrdersRef.current = pendingOrders;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const [entryLabels, setEntryLabels] = useState<EntryLabel[]>([]);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const slTpDraftsRef = useRef(slTpDrafts);
  slTpDraftsRef.current = slTpDrafts;

  const canBrokerInteract = !!brokerAccountId && !isDemoAccount;
  const canSubmitToBroker = canBrokerInteract && (liveTradingEnabled || isAlpacaAccount);
  const canModify = canBrokerInteract;

  const submitModify = useCallback(
    async (input: {
      targetKey: string;
      positionId?: string;
      orderId?: string;
      stopLoss: number | null;
      takeProfit: number | null;
      openPrice?: number | null;
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
          {
            openPrice: input.openPrice ?? undefined,
            stopLoss: input.stopLoss ?? undefined,
            takeProfit: input.takeProfit ?? undefined,
          },
          isAlpacaAccount,
        );
      } else if (input.positionId) {
        result = await callModifyPosition(
          brokerAccountId,
          input.positionId,
          input.stopLoss ?? undefined,
          input.takeProfit ?? undefined,
          isAlpacaAccount,
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
    [brokerAccountId, isAlpacaAccount, isDemoAccount, onDemoModify, onModifyFeedback, onSlTpDraftClear],
  );

  const handleLevelChange = useCallback(
    async (input: {
      targetKey: string;
      field: "sl" | "tp" | "entry";
      positionId?: string;
      orderId?: string;
      currentSl: number | null;
      currentTp: number | null;
      currentOpenPrice: number | null;
      newPrice: number;
    }) => {
      if (!canSubmitToBroker && !isDemoAccount) {
        onModifyFeedback?.({
          ok: false,
          message: "Turn on Live trading in Settings to modify broker orders.",
        });
        return;
      }

      if (isDemoAccount && input.orderId && onDemoOrderModify) {
        const newSl = input.field === "sl" ? input.newPrice : input.currentSl;
        const newTp = input.field === "tp" ? input.newPrice : input.currentTp;
        const newOpen = input.field === "entry" ? input.newPrice : input.currentOpenPrice;
        onDemoOrderModify({
          orderId: input.orderId,
          openPrice: newOpen ?? undefined,
          stopLoss: newSl,
          takeProfit: newTp,
        });
        onSlTpDraftClear?.(input.targetKey);
        onModifyFeedback?.({ ok: true, message: "Demo order updated" });
        return;
      }

      // Pending limit/stop entry: apply on release (MT5-style direct modify).
      if (input.orderId && input.field === "entry") {
        await submitModify({
          targetKey: input.targetKey,
          orderId: input.orderId,
          stopLoss: input.currentSl,
          takeProfit: input.currentTp,
          openPrice: input.newPrice,
        });
        return;
      }

      const newSl = input.field === "sl" ? input.newPrice : input.currentSl;
      const newTp = input.field === "tp" ? input.newPrice : input.currentTp;
      const newOpenPrice = input.field === "entry" ? input.newPrice : input.currentOpenPrice;

      if (instantSlTpModify) {
        await submitModify({
          targetKey: input.targetKey,
          positionId: input.positionId,
          orderId: input.orderId,
          stopLoss: newSl,
          takeProfit: newTp,
          openPrice: input.orderId ? newOpenPrice : undefined,
        });
        return;
      }

      onSlTpDraftChange?.({
        key: input.targetKey,
        stopLoss: newSl,
        takeProfit: newTp,
        openPrice: input.orderId ? newOpenPrice : undefined,
        positionId: input.positionId,
        orderId: input.orderId,
      });
    },
    [instantSlTpModify, onSlTpDraftChange, onSlTpDraftClear, submitModify, canSubmitToBroker, isDemoAccount, onDemoOrderModify, onModifyFeedback],
  );

  const computeEntryLabels = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const next: EntryLabel[] = [];
    const drafts = slTpDraftsRef.current;

    for (const o of overlays) {
      const side = o.side as "buy" | "sell" | null;
      const targetKey = slTpDraftKeyForPosition(o.id);
      const hasDraft = Boolean(drafts[targetKey]);

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
            showConfirm: hasDraft && canModify,
            confirmTargetKey: targetKey,
            positionId: o.id,
          });
        }
      }
    }

    // ── Pending orders (limit / stop) ──
    for (const o of pendingOrdersRef.current) {
      const side = o.side as "buy" | "sell";
      const typeLabel = o.type.replace(/_/g, " ").toUpperCase();
      const canDragOrder = liveTradingEnabled && !!brokerAccountId;

      // Entry / trigger price (not draggable — entry price modification is complex)
      if (o.openPrice != null && o.openPrice > 0) {
        const y = canvas.priceToCoordinate(o.openPrice);
        if (y != null) {
          next.push({
            key: `pend-entry-${o.id}`,
            y,
            text: `${typeLabel} ${o.volume}`,
            color: entryColor(side),
            draggable: false,
            orderId: o.id,
          });
        }
      }

      // SL (draggable)
      if (o.stopLoss != null && o.stopLoss > 0) {
        const y = canvas.priceToCoordinate(o.stopLoss);
        if (y != null) {
          const pnl = slTpPnl(o.openPrice, o.stopLoss, o.volume, side, symbolRef.current);
          next.push({
            key: `pend-sl-${o.id}`,
            y,
            text: `SL${pnl ? `, ${pnl}` : ""}`,
            color: CHART_THEME.stopLine,
            draggable: canDragOrder,
            field: "sl",
            orderId: o.id,
            currentSl: o.stopLoss,
            currentTp: o.takeProfit,
          });
        }
      }

      // TP (draggable)
      if (o.takeProfit != null && o.takeProfit > 0) {
        const y = canvas.priceToCoordinate(o.takeProfit);
        if (y != null) {
          const pnl = slTpPnl(o.openPrice, o.takeProfit, o.volume, side, symbolRef.current);
          next.push({
            key: `pend-tp-${o.id}`,
            y,
            text: `TP${pnl ? `, ${pnl}` : ""}`,
            color: CHART_THEME.takeLine,
            draggable: canDragOrder,
            field: "tp",
            orderId: o.id,
            currentSl: o.stopLoss,
            currentTp: o.takeProfit,
          });
        }
      }
    }

    setEntryLabels(next);
  }, [canvasRef, canModify, overlays, pendingOrders]);

  useEffect(() => {
    computeEntryLabels();
    const canvas = canvasRef.current;
    if (!canvas) return;
    return canvas.subscribeViewport(computeEntryLabels);
  }, [canvasRef, computeEntryLabels, overlays, pendingOrders, slTpDrafts]);

  const handleConfirm = useCallback(
    async (label: EntryLabel) => {
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
          openPrice: draft.openPrice ?? undefined,
        });
      } finally {
        setConfirmingKey(null);
      }
    },
    [confirmingKey, submitModify],
  );

  const lineItems: Array<{
    key: string;
    price: number;
    label: string;
    color: string;
    dashed: boolean;
    field: "sl" | "tp" | "entry";
    targetKey: string;
    positionId?: string;
    orderId?: string;
    currentSl: number | null;
    currentTp: number | null;
    currentOpenPrice: number | null;
    entryPrice: number | null;
    volume: number;
    side: "buy" | "sell";
    disabled: boolean;
  }> = [];

  const handlePendingCancel = useCallback(
    async (orderId: string) => {
      if (!brokerAccountId) return;
      const res = await callCancelOrder(brokerAccountId, orderId);
      if (!res.ok) {
        console.warn("[PositionLabelsOverlay] Cancel pending order failed:", res.message);
      }
      setArmedPendingOrderId(null);
    },
    [brokerAccountId],
  );

  if (labels.length === 0 && !dragState) return null;

  for (const o of overlays) {
    const side = (o.side ?? "buy") as "buy" | "sell";
    const targetKey = slTpDraftKeyForPosition(o.id);
    const draft = slTpDrafts[targetKey];
    const sl = draft?.stopLoss ?? o.stopLoss;
    const tp = draft?.takeProfit ?? o.takeProfit;

    if (sl != null && sl > 0) {
      lineItems.push({
        key: `sl-${o.id}`,
        price: sl,
        label: "SL",
        color: theme.stopLine,
        dashed: true,
        field: "sl",
        targetKey,
        positionId: o.id,
        currentSl: sl,
        currentTp: tp,
        currentOpenPrice: null,
        entryPrice: o.entryPrice,
        volume: o.volume,
        side,
        disabled: !canModify,
      });
    }
    if (tp != null && tp > 0) {
      lineItems.push({
        key: `tp-${o.id}`,
        price: tp,
        label: "TP",
        color: theme.takeLine,
        dashed: true,
        field: "tp",
        targetKey,
        positionId: o.id,
        currentSl: sl,
        currentTp: tp,
        currentOpenPrice: null,
        entryPrice: o.entryPrice,
        volume: o.volume,
        side,
        disabled: !canModify,
      });
    }
  }

  for (const o of pendingOrders) {
    const side = o.side as "buy" | "sell";
    const targetKey = slTpDraftKeyForOrder(o.id);
    const draft = slTpDrafts[targetKey];
    const entryPrice = draft?.openPrice ?? o.openPrice;
    const sl = draft?.stopLoss ?? o.stopLoss;
    const tp = draft?.takeProfit ?? o.takeProfit;
    const pendingDisabled = !canModify;

    if (entryPrice != null && entryPrice > 0) {
      const typeLabel = o.type.replace(/_/g, " ").toUpperCase();
      pendingEntryLines.push({
        key: `pend-entry-${o.id}`,
        price: entryPrice,
        label: typeLabel,
        color: entryColor(side),
        targetKey,
        orderId: o.id,
        currentSl: sl,
        currentTp: tp,
        side,
        volume: o.volume,
        disabled: pendingDisabled,
      });
    }

    if (sl != null && sl > 0) {
      lineItems.push({
        key: `pend-sl-${o.id}`,
        price: sl,
        label: "SL",
        color: theme.stopLine,
        dashed: true,
        field: "sl",
        targetKey,
        orderId: o.id,
        currentSl: sl,
        currentTp: tp,
        currentOpenPrice: entryPrice ?? null,
        entryPrice: entryPrice ?? null,
        volume: o.volume,
        side,
        disabled: pendingDisabled,
      });
    }
    if (tp != null && tp > 0) {
      lineItems.push({
        key: `tp-${o.id}-pend`,
        price: tp,
        label: "TP",
        color: theme.takeLine,
        dashed: true,
        field: "tp",
        targetKey,
        orderId: o.id,
        currentSl: sl,
        currentTp: tp,
        currentOpenPrice: entryPrice ?? null,
        entryPrice: entryPrice ?? null,
        volume: o.volume,
        side,
        disabled: pendingDisabled,
      });
    }
  }

  if (entryLabels.length === 0 && lineItems.length === 0 && pendingEntryLines.length === 0) return null;

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
              pointerEvents:
                label.draggable || label.key.startsWith("pend-entry-") ? "auto" : "none",
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
            ) : label.key.startsWith("pend-entry-") && label.orderId ? (
              <div className="flex items-center gap-1 pl-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setArmedPendingOrderId((prev) => (prev === label.orderId ? null : label.orderId ?? null));
                  }}
                  style={{
                    color: label.color,
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    textShadow:
                      "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)",
                  }}
                >
                  {label.text}
                </button>
                {armedPendingOrderId === label.orderId ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handlePendingCancel(label.orderId!);
                    }}
                    className="grid h-4 w-4 place-items-center rounded-full border border-white/25 bg-black/75 text-[9px] text-white/80"
                    aria-label="Cancel pending order"
                  >
                    ✕
                  </button>
                ) : null}
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
        />
      ))}

      {lineItems.map((line) => (
        <PositionSlTpLine
          key={line.key}
          canvasRef={canvasRef}
          price={line.price}
          label={line.label}
          color={line.color}
          digits={digits}
          symbol={symbol}
          entryPrice={line.entryPrice}
          volume={line.volume}
          side={line.side}
          disabled={line.disabled}
          onChange={(newPrice) => {
            void handleLevelChange({
              targetKey: line.targetKey,
              field: line.field,
              positionId: line.positionId,
              orderId: line.orderId,
              currentSl: line.currentSl,
              currentTp: line.currentTp,
              currentOpenPrice: line.currentOpenPrice,
              newPrice,
            });
          }}
        />
      ))}

      {entryLabels.map((label) => (
        <div
          key={label.key}
          className="pointer-events-none absolute left-0 z-[26] -translate-y-1/2 whitespace-nowrap"
          style={{ top: label.y }}
        >
          <div className="pointer-events-auto flex items-center gap-1">
            {label.showConfirm ? (
              <button
                type="button"
                onClick={() => void handleConfirm(label)}
                disabled={confirmingKey === label.confirmTargetKey}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-cyan-400/35 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(0,212,245,0.25)] active:scale-95 disabled:opacity-50"
                aria-label="Confirm SL and TP on broker"
                title="Set SL / TP (MetaTrader style)"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
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
        </div>
      ))}
    </div>
  );
}
