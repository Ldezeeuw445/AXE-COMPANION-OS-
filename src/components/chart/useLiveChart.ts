"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ChartLiveEvent,
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
  | "connected"
  | "live_stream"
  | "delayed_polling"
  | "reconnecting"
  | "stale"
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
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

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
        setLastUpdateAt(null);
        setReconnectAttempt(0);
      });
      return;
    }

    let cancelled = false;
    // ── Transport isolation: track WS and SSE cleanup separately so
    //    an incoming WS connection can abort a lingering SSE, preventing
    //    both transports from polling MetaAPI at the same time (429s).
    let cleanupWs: (() => void) | null = null;
    let cleanupSse: (() => void) | null = null;
    let backoff = 1500;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;
    let lastDataAt = Date.now();
    let hasStableData = false;
    const transportRef = { current: "off" as LiveTransport };

    /** Kill whatever is running on the *other* transport. */
    function killOtherTransport(active: "ws" | "sse") {
      if (active === "ws" && cleanupSse) {
        cleanupSse();
        cleanupSse = null;
      } else if (active === "sse" && cleanupWs) {
        cleanupWs();
        cleanupWs = null;
      }
    }

    queueMicrotask(() => {
      if (cancelled) return;
      setUiStatus("connecting");
      setTransport("off");
      setReason(null);
      setLastUpdateAt(null);
      setReconnectAttempt(0);
    });

    function clearHealthTimers() {
      if (staleTimer) clearTimeout(staleTimer);
      if (offlineTimer) clearTimeout(offlineTimer);
      staleTimer = null;
      offlineTimer = null;
    }

    function setUi(next: LiveUiStatus) {
      queueMicrotask(() => {
        if (!cancelled) setUiStatus(next);
      });
    }

    function setReasonSafe(next: string | null) {
      queueMicrotask(() => {
        if (!cancelled) setReason(next);
      });
    }

    function markHealthy(next: LiveUiStatus) {
      if (cancelled) return;
      lastDataAt = Date.now();
      hasStableData = true;
      setReasonSafe(null);
      queueMicrotask(() => {
        if (!cancelled) setLastUpdateAt(new Date(lastDataAt).toISOString());
      });
      setUi(next);
      clearHealthTimers();
      staleTimer = setTimeout(() => {
        if (cancelled) return;
        const staleForMs = Date.now() - lastDataAt;
        if (staleForMs >= 30_000) {
          setReasonSafe("No live update received for 30 seconds.");
          setUi("stale");
        }
      }, 30_000);
      offlineTimer = setTimeout(() => {
        if (cancelled) return;
        const offlineForMs = Date.now() - lastDataAt;
        if (offlineForMs >= 90_000) {
          setReasonSafe("Live feed has not responded for 90 seconds.");
          setUi("offline");
        }
      }, 90_000);
    }

    function scheduleReconnect(kind: "ws" | "sse") {
      if (cancelled || retryTimer) return;
      const delay = backoff;
      setReconnectAttempt((n) => n + 1);
      setUi(hasStableData ? "reconnecting" : "connecting");
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (cancelled) return;
        if (kind === "ws") {
          void connectWs().then((ok) => {
            if (!ok) void connectSse();
          });
        } else {
          void connectSse();
        }
      }, delay);
      backoff = Math.min(backoff * 2, 15_000);
    }

    async function fetchSessionWithTimeout(): Promise<{ token?: string | null; wsUrl?: string | null } | null> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8_000);
      try {
        const res = await fetch("/api/chart/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ctrl.signal,
          body: JSON.stringify({
            accountId,
            displaySymbol,
            brokerSymbol,
            timeframe: timeframeKey,
          }),
        });
        if (!res.ok) return null;
        return (await res.json()) as { token?: string | null; wsUrl?: string | null };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    function eventMatchesSubscription(evt: ChartLiveEvent): boolean {
      const eventAccount = "accountId" in evt ? evt.accountId : null;
      const eventDisplay = "displaySymbol" in evt ? evt.displaySymbol : null;
      const eventBroker = "brokerSymbol" in evt ? evt.brokerSymbol : null;
      const eventTf = "timeframe" in evt ? evt.timeframe : null;
      const metaTf =
        timeframeKey === "m5"
          ? "5m"
          : timeframeKey === "m15"
            ? "15m"
            : timeframeKey === "m30"
              ? "30m"
              : timeframeKey === "h1"
                ? "1h"
                : timeframeKey === "h4"
                  ? "4h"
                  : timeframeKey === "d1"
                    ? "1d"
                    : timeframeKey;
      if (eventAccount && eventAccount !== accountId) return false;
      if (eventDisplay && eventDisplay.toUpperCase() !== displaySymbol.toUpperCase()) return false;
      if (eventBroker && eventBroker !== brokerSymbol) return false;
      if (eventTf && eventTf !== timeframeKey && eventTf !== metaTf) return false;
      return true;
    }

    function applyEvent(evt: ChartLiveEvent) {
      if (cancelled || !eventMatchesSubscription(evt)) return;
      switch (evt.type) {
        case "ready":
          setUi(hasStableData ? (transportRef.current === "ws" ? "connected" : "delayed_polling") : "connecting");
          return;
        case "tick": {
          const mid = evt.price ?? evt.bid ?? evt.ask ?? null;
          handlersRef.current.onTick?.({
            mid: mid != null ? Number(mid) : null,
            bid: evt.bid ?? null,
            ask: evt.ask ?? null,
            time: evt.timestamp ?? null,
          });
          markHealthy(transportRef.current === "ws" ? "connected" : "delayed_polling");
          return;
        }
        case "candle_update":
          handlersRef.current.onCandleUpdate?.(evt.candle);
          markHealthy(transportRef.current === "ws" ? "connected" : "delayed_polling");
          return;
        case "positions_update":
          handlersRef.current.onPositions?.({
            total: typeof evt.total === "number" ? evt.total : 0,
            onSymbol: Array.isArray(evt.onSymbol) ? evt.onSymbol : [],
          });
          markHealthy(transportRef.current === "ws" ? "connected" : "delayed_polling");
          return;
        case "live_status":
          if (evt.status === "live") {
            if (hasStableData) {
              markHealthy(transportRef.current === "ws" ? "connected" : "delayed_polling");
            } else {
              setUi("connecting");
            }
          } else if (evt.status === "delayed") {
            markHealthy("stale");
            setReasonSafe(evt.reason ?? "Live stream is delayed; showing the latest stable broker state.");
          } else if (evt.status === "reconnecting") {
            setReasonSafe(evt.reason ?? "Reconnecting to live broker data.");
            setUi("reconnecting");
          } else if (evt.status === "offline") {
            setReasonSafe(evt.reason ?? "Live broker data is offline.");
            setUi("offline");
          } else if (evt.status === "error") {
            setReasonSafe(evt.reason ?? "Live broker data returned an error.");
            setUi("failed");
          }
          return;
        case "market_alert":
          // High-impact calendar/news event pushed by the backend.
          // The UI can subscribe via onMarketAlert in a future pass;
          // for now we treat it as a health signal.
          markHealthy(transportRef.current === "ws" ? "connected" : "delayed_polling");
          return;
        case "heartbeat":
          if (!hasStableData) setUi("connecting");
          return;
        case "error":
          return;
        default:
          return;
      }
    }

    function setT(next: LiveTransport) {
      transportRef.current = next;
      queueMicrotask(() => {
        if (!cancelled) setTransport(next);
      });
    }

    async function connectWs(): Promise<boolean> {
      try {
        const j = await fetchSessionWithTimeout();
        if (!j) return false;
        if (!j.token || !j.wsUrl) return false;

        const wsBase = j.wsUrl.replace(/\/$/, "");
        const wsUrl = `${wsBase}?account=${encodeURIComponent(accountId!)}&symbol=${encodeURIComponent(displaySymbol)}&tf=${encodeURIComponent(timeframeKey)}&token=${encodeURIComponent(j.token)}`;

        if (cancelled) return false;
        setT("ws");
        setUi(hasStableData ? "reconnecting" : "connecting");
        const ws = new WebSocket(wsUrl);

        let opened = false;
        ws.onopen = () => {
          opened = true;
          backoff = 1500;
          // ── WS connected: kill any lingering SSE immediately.
          killOtherTransport("ws");
          setUi(hasStableData ? "connected" : "connecting");
        };
        ws.onmessage = (ev) => {
          if (cancelled) return;
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
          cleanupWs = null;
          if (cancelled) return;
          if (!opened) {
            // Token/edge unhealthy → fall back to SSE.
            void connectSse();
            return;
          }
          scheduleReconnect("ws");
        };

        cleanupWs = () => {
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
      // ── SSE starting: make sure no WS is still alive (its DO would
      //    keep polling MetaAPI in parallel → 429s).
      killOtherTransport("sse");
      setT("sse");
      setUi(hasStableData ? "reconnecting" : "connecting");
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
        setUi(hasStableData ? "delayed_polling" : "connecting");
      };
      es.onmessage = (ev) => {
        if (cancelled) return;
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
        cleanupSse = null;
        if (cancelled) return;
        if (!opened && !hasStableData) {
          setUi("offline");
        } else {
          setUi("reconnecting");
        }
        scheduleReconnect("sse");
      };
      cleanupSse = () => {
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
      clearHealthTimers();
      if (cleanupWs) cleanupWs();
      if (cleanupSse) cleanupSse();
    };
  }, [enabled, accountId, displaySymbol, brokerSymbol, timeframeKey]);

  return { status: uiStatus, transport, reason, lastUpdateAt, reconnectAttempt };
}
