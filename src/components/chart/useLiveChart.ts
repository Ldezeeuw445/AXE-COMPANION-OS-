"use client";

import { useEffect, useRef, useState } from "react";
import type { MetaApiCandle } from "@/lib/mt5/metaApiClient";

export type LiveStatus = "idle" | "connecting" | "connected" | "live" | "delayed" | "failed";

export type LivePosition = {
  id: string;
  side: string;
  symbol: string;
  volume: number;
  entryPrice: number | null;
  currentPrice: number | null;
  profit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: string | null;
};

export type LiveChartHandlers = {
  onTick?: (tick: { mid: number | null; bid: number | null; ask: number | null; time: string | null }) => void;
  onCandleUpdate?: (candle: MetaApiCandle) => void;
  onPositions?: (p: { total: number; onSymbol: LivePosition[] }) => void;
};

type Args = LiveChartHandlers & {
  enabled: boolean;
  accountId: string | null;
  brokerSymbol: string;
  timeframeKey: string;
};

/**
 * Subscribe to /api/chart/live SSE stream and forward events to caller-supplied
 * handlers (kept in refs, so the SSE doesn't reconnect on prop change).
 *
 * Reconnect strategy: short backoff on close while `enabled` stays true.
 */
export function useLiveChart({
  enabled,
  accountId,
  brokerSymbol,
  timeframeKey,
  onTick,
  onCandleUpdate,
  onPositions,
}: Args) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);

  const handlersRef = useRef<LiveChartHandlers>({});

  useEffect(() => {
    handlersRef.current = { onTick, onCandleUpdate, onPositions };
  }, [onTick, onCandleUpdate, onPositions]);

  useEffect(() => {
    if (!enabled || !accountId || !brokerSymbol) {
      queueMicrotask(() => setStatus("idle"));
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;
    let backoff = 1500;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      queueMicrotask(() => setStatus("connecting"));
      const qs = new URLSearchParams({
        account: accountId!,
        symbol: brokerSymbol,
        tf: timeframeKey,
      }).toString();

      const next = new EventSource(`/api/chart/live?${qs}`);
      es = next;

      next.onopen = () => {
        backoff = 1500;
        setStatus("connected");
      };

      next.onerror = () => {
        next.close();
        if (cancelled) return;
        setStatus("delayed");
        reconnectTimer = setTimeout(() => connect(), backoff);
        backoff = Math.min(backoff * 2, 15_000);
      };

      next.onmessage = (ev) => {
        if (!ev.data) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        const evt = parsed as { type?: string; [k: string]: unknown };
        switch (evt.type) {
          case "ready":
            setStatus("connected");
            return;
          case "tick": {
            const t = evt as {
              mid?: number | null;
              bid?: number | null;
              ask?: number | null;
              time?: string | null;
            };
            handlersRef.current.onTick?.({
              mid: t.mid ?? null,
              bid: t.bid ?? null,
              ask: t.ask ?? null,
              time: t.time ?? null,
            });
            return;
          }
          case "candle-update": {
            const c = (evt as { candle?: MetaApiCandle }).candle;
            if (c) handlersRef.current.onCandleUpdate?.(c);
            return;
          }
          case "positions": {
            const p = evt as { total?: number; onSymbol?: LivePosition[] };
            handlersRef.current.onPositions?.({
              total: typeof p.total === "number" ? p.total : 0,
              onSymbol: Array.isArray(p.onSymbol) ? p.onSymbol : [],
            });
            return;
          }
          case "status": {
            const s = (evt as { status?: LiveStatus; reason?: string }).status;
            if (s) setStatus(s);
            const r = (evt as { reason?: string }).reason;
            setReason(r ?? null);
            return;
          }
          case "ping":
            return;
          default:
            return;
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, [enabled, accountId, brokerSymbol, timeframeKey]);

  return { status, reason };
}
