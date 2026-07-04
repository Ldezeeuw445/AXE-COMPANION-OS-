"use client";

/**
 * Virtual resting limit/stop orders for AXE Demo Account.
 * Mirrors broker pending orders on chart (MT5-style) without MetaAPI.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PendingOrderOverlay } from "@/lib/broker/loadChartPageData";

export type DemoPendingOrder = {
  id: string;
  brokerAccountId: string;
  symbol: string;
  type: "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
  side: "buy" | "sell";
  volume: number;
  openPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: string;
};

const STORAGE_KEY = "axe.demo.pending.v1";

function loadAll(): DemoPendingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOrder);
  } catch {
    return [];
  }
}

function saveAll(orders: DemoPendingOrder[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* best effort */
  }
}

function isOrder(o: unknown): o is DemoPendingOrder {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.brokerAccountId === "string" &&
    typeof r.symbol === "string" &&
    typeof r.type === "string" &&
    (r.side === "buy" || r.side === "sell") &&
    typeof r.volume === "number" &&
    typeof r.openPrice === "number" &&
    typeof r.createdAt === "string"
  );
}

function toOverlay(o: DemoPendingOrder): PendingOrderOverlay {
  return {
    id: o.id,
    symbol: o.symbol,
    type: o.type,
    side: o.side,
    volume: o.volume,
    openPrice: o.openPrice,
    currentPrice: null,
    stopLoss: o.stopLoss,
    takeProfit: o.takeProfit,
    openTime: o.createdAt,
  };
}

export function useDemoPendingOrders(
  brokerAccountId: string | null | undefined,
  activeSymbol: string,
  livePrice: number | null | undefined,
  onFill: (input: {
    symbol: string;
    side: "buy" | "sell";
    volume: number;
    entryPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
  }) => void,
) {
  const [orders, setOrders] = useState<DemoPendingOrder[]>(() => loadAll());

  useEffect(() => {
    saveAll(orders);
  }, [orders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setOrders(loadAll());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Fill when price crosses trigger (simplified MT5 behavior).
  useEffect(() => {
    if (livePrice == null || !Number.isFinite(livePrice) || !brokerAccountId) return;
    setOrders((prev) => {
      const survivors: DemoPendingOrder[] = [];
      let changed = false;
      for (const o of prev) {
        if (o.brokerAccountId !== brokerAccountId || o.symbol !== activeSymbol.toUpperCase()) {
          survivors.push(o);
          continue;
        }
        const triggered =
          (o.type === "buy_limit" && livePrice <= o.openPrice) ||
          (o.type === "sell_limit" && livePrice >= o.openPrice) ||
          (o.type === "buy_stop" && livePrice >= o.openPrice) ||
          (o.type === "sell_stop" && livePrice <= o.openPrice);
        if (triggered) {
          changed = true;
          onFill({
            symbol: o.symbol,
            side: o.side,
            volume: o.volume,
            entryPrice: o.openPrice,
            stopLoss: o.stopLoss,
            takeProfit: o.takeProfit,
          });
          continue;
        }
        survivors.push(o);
      }
      return changed ? survivors : prev;
    });
  }, [activeSymbol, brokerAccountId, livePrice, onFill]);

  const place = useCallback(
    (input: {
      symbol: string;
      type: DemoPendingOrder["type"];
      side: "buy" | "sell";
      volume: number;
      openPrice: number;
      stopLoss?: number | null;
      takeProfit?: number | null;
    }) => {
      if (!brokerAccountId) return null;
      const next: DemoPendingOrder = {
        id: `demo-pend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        brokerAccountId,
        symbol: input.symbol.toUpperCase(),
        type: input.type,
        side: input.side,
        volume: input.volume,
        openPrice: input.openPrice,
        stopLoss: input.stopLoss ?? null,
        takeProfit: input.takeProfit ?? null,
        createdAt: new Date().toISOString(),
      };
      setOrders((prev) => [next, ...prev]);
      return next;
    },
    [brokerAccountId],
  );

  const modify = useCallback(
    (id: string, fields: { openPrice?: number; stopLoss?: number | null; takeProfit?: number | null }) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          return {
            ...o,
            openPrice: fields.openPrice ?? o.openPrice,
            stopLoss: fields.stopLoss !== undefined ? fields.stopLoss : o.stopLoss,
            takeProfit: fields.takeProfit !== undefined ? fields.takeProfit : o.takeProfit,
          };
        }),
      );
    },
    [],
  );

  const cancel = useCallback((id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const forSymbol = useMemo(() => {
    if (!brokerAccountId) return [] as PendingOrderOverlay[];
    return orders
      .filter((o) => o.brokerAccountId === brokerAccountId && o.symbol === activeSymbol.toUpperCase())
      .map(toOverlay);
  }, [activeSymbol, brokerAccountId, orders]);

  const all = useMemo(() => {
    if (!brokerAccountId) return [] as PendingOrderOverlay[];
    return orders
      .filter((o) => o.brokerAccountId === brokerAccountId)
      .map(toOverlay);
  }, [brokerAccountId, orders]);

  return { all, forSymbol, place, modify, cancel };
}
