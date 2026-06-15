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

type EntryLabel = {
  key: string;
  y: number;
  text: string;
  color: string;
  showConfirm: boolean;
  confirmTargetKey: string;
  positionId?: string;
  orderId?: string;
};

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
  onModifyFeedback?: (result: { ok: boolean; message?: string }) => void;
  isDark?: boolean;
}) {
  const theme = isDark ? CHART_THEME : getChartTheme("paper");
  const labelShadow = isDark
    ? "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.8)"
    : "0 1px 0 rgba(255,255,255,0.82)";
  const digits = priceDigitsForSymbol(symbol);

  const [entryLabels, setEntryLabels] = useState<EntryLabel[]>([]);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const slTpDraftsRef = useRef(slTpDrafts);
  slTpDraftsRef.current = slTpDrafts;

  const canModify = !!brokerAccountId && (liveTradingEnabled || isDemoAccount || isAlpacaAccount);

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
    [instantSlTpModify, onSlTpDraftChange, submitModify],
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

    for (const o of pendingOrders) {
      const typeLabel = o.type.replace(/_/g, " ").toUpperCase();
      const targetKey = slTpDraftKeyForOrder(o.id);
      const draft = drafts[targetKey];
      const entryPrice = draft?.openPrice ?? o.openPrice;
      const hasDraft = Boolean(draft);

      if (entryPrice != null && entryPrice > 0) {
        const y = canvas.priceToCoordinate(entryPrice);
        if (y != null) {
          next.push({
            key: `pend-entry-${o.id}`,
            y,
            text: `${typeLabel} ${o.volume}${hasDraft && draft?.openPrice != null ? " · draft" : ""}`,
            color: entryColor(o.side),
            showConfirm: hasDraft && canModify && !isDemoAccount,
            confirmTargetKey: targetKey,
            orderId: o.id,
          });
        }
      }
    }

    setEntryLabels(next);
  }, [canvasRef, canModify, isDemoAccount, overlays, pendingOrders]);

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
    const pendingDisabled = !canModify || isDemoAccount;

    if (entryPrice != null && entryPrice > 0) {
      lineItems.push({
        key: `pend-entry-${o.id}`,
        price: entryPrice,
        label: o.type.replace(/_/g, " "),
        color: entryColor(side),
        dashed: false,
        field: "entry",
        targetKey,
        orderId: o.id,
        currentSl: sl,
        currentTp: tp,
        currentOpenPrice: entryPrice,
        entryPrice,
        volume: o.volume,
        side,
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

  if (entryLabels.length === 0 && lineItems.length === 0) return null;

  return (
    <div className="absolute inset-0 z-[22] overflow-hidden">
      {lineItems.map((line) => (
        <TradePlanLine
          key={line.key}
          canvasRef={canvasRef}
          price={line.price}
          label={line.label}
          color={line.color}
          digits={digits}
          symbol={symbol}
          dashed={line.dashed}
          entryPrice={line.entryPrice}
          volume={line.volume}
          side={line.side}
          disabled={line.disabled}
          zIndex={24}
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
