"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Standalone alert evaluator for the AXE Companion app.
 *
 * Loads the user's active price alerts for the active symbol and watches a
 * caller-supplied live price. When the price crosses an `above` / `below`
 * threshold (compared to the last observed price), the evaluator marks the
 * alert as triggered server-side via `/api/alerts/[id]/trigger`, which
 * persists `triggered_at` and best-effort fires a web-push.
 *
 * The hook is deliberately self-contained: it does NOT depend on TradingOS
 * or any external evaluator. If TradingOS happens to be running too, both
 * paths will land in the same `user_alerts` table and the cooldown logic on
 * `/trigger` ensures the user only gets notified once per oscillation.
 */

export type AlertRow = {
  id: string;
  symbol: string | null;
  type: string;
  condition: string | null;
  threshold: number | null;
  status: "active" | "paused" | string;
  triggered_at: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AlertFiredEvent = {
  alertId: string;
  symbol: string;
  condition: "above" | "below";
  threshold: number;
  price: number;
  message: string;
  pushed: boolean;
};

type Args = {
  enabled: boolean;
  /** Display symbol for the chart that's currently open (e.g. XAUUSD). */
  symbol: string;
  /** Optional cooldown so we don't re-fire when price oscillates. */
  cooldownSeconds?: number;
  /** Called whenever an alert fires — surface this as a toast/banner. */
  onFire?: (event: AlertFiredEvent) => void;
};

export function useAlertEvaluator({ enabled, symbol, cooldownSeconds = 60, onFire }: Args) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastPriceRef = useRef<number | null>(null);
  const lastFireAtRef = useRef<Map<string, number>>(new Map());
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onFireRef.current = onFire;
  }, [onFire]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/alerts", { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 401 ? "auth" : `http_${res.status}`);
        setAlerts([]);
        return;
      }
      const j = (await res.json()) as { alerts?: AlertRow[] };
      const next = (j.alerts ?? []).filter(
        (a) =>
          a.status === "active" &&
          a.type === "price" &&
          a.threshold != null &&
          a.condition != null &&
          (!a.symbol || a.symbol.toUpperCase() === symbol.toUpperCase()),
      );
      setAlerts(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, [enabled, symbol]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, [enabled, refresh]);

  const evaluate = useCallback(
    (price: number | null) => {
      if (!enabled || price == null || !Number.isFinite(price) || alerts.length === 0) {
        if (price != null && Number.isFinite(price)) lastPriceRef.current = price;
        return;
      }

      const previous = lastPriceRef.current;
      lastPriceRef.current = price;
      if (previous == null) return; // need two samples for crossing detection

      for (const alert of alerts) {
        const threshold = Number(alert.threshold);
        if (!Number.isFinite(threshold)) continue;

        const condition = alert.condition === "below" ? "below" : "above";
        const crossed =
          condition === "above"
            ? previous < threshold && price >= threshold
            : previous > threshold && price <= threshold;
        if (!crossed) continue;

        const lastFire = lastFireAtRef.current.get(alert.id) ?? 0;
        if (Date.now() - lastFire < cooldownSeconds * 1000) continue;
        lastFireAtRef.current.set(alert.id, Date.now());

        const message = `${alert.symbol ?? symbol} ${condition} ${threshold}`;
        // Optimistic local fire so the UI updates instantly.
        onFireRef.current?.({
          alertId: alert.id,
          symbol: alert.symbol ?? symbol,
          condition,
          threshold,
          price,
          message,
          pushed: false,
        });

        void (async () => {
          try {
            const res = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/trigger`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ price, message, cooldownSeconds }),
            });
            if (res.ok) {
              const j = (await res.json().catch(() => null)) as { pushed?: boolean } | null;
              if (j?.pushed) {
                onFireRef.current?.({
                  alertId: alert.id,
                  symbol: alert.symbol ?? symbol,
                  condition,
                  threshold,
                  price,
                  message,
                  pushed: true,
                });
              }
            }
          } catch {
            /* swallow — already surfaced locally */
          }
        })();
      }
    },
    [alerts, cooldownSeconds, enabled, symbol],
  );

  return { alerts, error, evaluate, refresh };
}
