"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ChartLiveEvent,
  ChartLiveStatus,
  LivePositionPayload,
  LiveCandle,
} from "@/lib/chart/liveContract";

export type LiveTransport = "ws" | "sse" | "off";

/**
 * Status surfaced to the UI. Combines the transport layer with the upstream
 * MetaApi feed status reported by the Worker / SSE.
 */
export type LiveUiStatus =
  | "idle"
  | "connecting"
  | "live_stream"
  | "delayed_polling"
  | "reconnecting"
  | "offline"
  | "failed";

export type LivePosition = LivePositionPayload;

export type LiveChartHandlers = {
  onTick?: (tick: { mid: number | null; bid: number | null; ask: number | null; time: string | null }) => void;
  onCandleUpdate?: (candle: LiveCandle) => void;
  onPositions?: (p: { total: number; onSymbol: LivePosition[] }) => void;
};

type Args = LiveChartHandlers & {
  enabled: boolean;
  /** user_broker_accounts.id */
  accountId: string | null;
  /** Symbol the UI shows (e.g. XAUUSD). */
  displaySymbol: string;
  /** Broker-resolved symbol to actually request from MetaApi (e.g. XAUUSDm). */
  brokerSymbol: string;
  /** tf key m5..d1 */
  timeframeKey: string;
};

/**
 * Subscribe to a live MT5 stream for the given account/symbol/timeframe.
 *
 * Transport selection:
 *   1. WS to Cloudflare ChartLiveRoom (preferred) — when /api/chart/session
 *      returns a token + wsUrl.
 *   2. SSE fallback to /api/chart/live with the same event contract.
 *
 * Both transports forward to caller-supplied handlers (kept in refs).
 */
export function useLiveChart({
  enabled,
  accountId,
  displaySymbol,
  brokerSymbol,
  timeframeKey,
  onTick,
  onCandleUpdate,
  onPositions,
}: Args) {
  const [uiStatus, setUiStatus] = useState<LiveUiStatus>("idle");
  const [transport, setTransport] = useState<LiveTransport>("off");
  const [reason, setReason] = useState<string | null>(null);

  const handlersRef = useRef<LiveChartHandlers>({});
  useEffect(() => {
    handlersRef.current = { onTick, onCandleUpdate, onPositions };
  }, [onTick, onCandleUpdate, onPositions]);

  useEffect(() => {
    if (!enabled || !accountId || !brokerSymbol || !displaySymbol) {
      queueMicrotask(() => {
        setUiStatus("idle");
        setTransport("off");
        setReason(null);
      });
      return;
    }

    let cancelled = false;
    let cleanupActive: (() => void) | null = null;
    let backoff = 1500;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let upstreamStatus: ChartLiveStatus | null = null;

    function setUi(next: LiveUiStatus) {
      queueMicrotask(() => {
        if (!cancelled) setUiStatus(next);
      });
    }

    function applyEvent(evt: ChartLiveEvent) {
      switch (evt.type) {
        case "ready":
          return;
        case "tick": {
          const mid = evt.price ?? evt.bid ?? evt.ask ?? null;
          handlersRef.current.onTick?.({
            mid: mid != null ? Number(mid) : null,
            bid: evt.bid ?? null,
            ask: evt.ask ?? null,
            time: evt.timestamp ?? null,
          });
          return;
        }
        case "candle_update":
          handlersRef.current.onCandleUpdate?.(evt.candle);
          return;
        case "positions_update":
          handlersRef.current.onPositions?.({
            total: typeof evt.total === "number" ? evt.total : 0,
            onSymbol: Array.isArray(evt.onSymbol) ? evt.onSymbol : [],
          });
          return;
        case "live_status":
          upstreamStatus = evt.status;
          setReason(evt.reason ?? null);
          if (evt.status === "live") {
            setUi(transportRef.current === "ws" ? "live_stream" : "delayed_polling");
          } else if (evt.status === "delayed") {
            setUi("delayed_polling");
          } else if (evt.status === "reconnecting") {
            setUi("reconnecting");
          } else if (evt.status === "offline") {
            setUi("offline");
          } else if (evt.status === "error") {
            setUi("failed");
          }
          return;
        case "heartbeat":
        case "error":
          return;
        default:
          return;
      }
    }

    const transportRef = { current: "off" as LiveTransport };
    function setT(next: LiveTransport) {
      transportRef.current = next;
      queueMicrotask(() => {
        if (!cancelled) setTransport(next);
      });
    }

    async function connectWs(): Promise<boolean> {
      try {
        const res = await fetch("/api/chart/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            accountId,
            displaySymbol,
            brokerSymbol,
            timeframe: timeframeKey,
          }),
        });
        if (!res.ok) return false;
        const j = (await res.json()) as { token?: string | null; wsUrl?: string | null };
        if (!j.token || !j.wsUrl) return false;

        const wsBase = j.wsUrl.replace(/\/$/, "");
        const wsUrl = `${wsBase}?account=${encodeURIComponent(accountId!)}&symbol=${encodeURIComponent(displaySymbol)}&tf=${encodeURIComponent(timeframeKey)}&token=${encodeURIComponent(j.token)}`;

        if (cancelled) return false;
        setT("ws");
        setUi("connecting");
        const ws = new WebSocket(wsUrl);

        let opened = false;
        ws.onopen = () => {
          opened = true;
          backoff = 1500;
          setUi(upstreamStatus === "live" ? "live_stream" : "live_stream");
        };
        ws.onmessage = (ev) => {
          if (!ev.data) return;
          try {
            const evt = JSON.parse(String(ev.data)) as ChartLiveEvent;
            applyEvent(evt);
          } catch {
            /* ignore malformed */
          }
        };
        ws.onerror = () => {
          // Let onclose drive recovery to avoid double scheduling.
        };
        ws.onclose = () => {
          if (cancelled) return;
          if (!opened) {
            // Token/edge unhealthy → fall back to SSE.
            cleanupActive = null;
            void connectSse();
            return;
          }
          setUi("reconnecting");
          retryTimer = setTimeout(() => {
            if (cancelled) return;
            void connectWs().then((ok) => {
              if (!ok) void connectSse();
            });
          }, backoff);
          backoff = Math.min(backoff * 2, 15_000);
        };

        cleanupActive = () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        };
        return true;
      } catch {
        return false;
      }
    }

    async function connectSse() {
      if (cancelled) return;
      setT("sse");
      setUi("connecting");
      const qs = new URLSearchParams({
        account: accountId!,
        symbol: displaySymbol,
        broker: brokerSymbol,
        tf: timeframeKey,
      }).toString();
      const es = new EventSource(`/api/chart/live?${qs}`);
      let opened = false;
      es.onopen = () => {
        opened = true;
        backoff = 1500;
        setUi("delayed_polling");
      };
      es.onmessage = (ev) => {
        if (!ev.data) return;
        try {
          const evt = JSON.parse(String(ev.data)) as ChartLiveEvent;
          applyEvent(evt);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        try {
          es.close();
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        if (!opened) {
          setUi("offline");
        } else {
          setUi("reconnecting");
        }
        retryTimer = setTimeout(() => connectSse(), backoff);
        backoff = Math.min(backoff * 2, 15_000);
      };
      cleanupActive = () => {
        try {
          es.close();
        } catch {
          /* ignore */
        }
      };
    }

    void connectWs().then((ok) => {
      if (!ok) void connectSse();
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (cleanupActive) cleanupActive();
    };
  }, [enabled, accountId, displaySymbol, brokerSymbol, timeframeKey]);

  return { status: uiStatus, transport, reason };
}
