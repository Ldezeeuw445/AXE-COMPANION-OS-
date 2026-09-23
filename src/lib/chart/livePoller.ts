/**
 * Shared MetaAPI live poller for the chart websocket gateway and SSE fallback.
 * Server-only — do not import from client components.
 */

import { metaApiTimeframeFromKey } from "@/lib/broker/chartTimeframes";
import {
  clientGetHistoricalCandles,
  clientGetOrders,
  clientGetPositions,
  clientGetSymbolPrice,
  MetaApiRequestError,
} from "@/lib/mt5/metaApiClient";
import type {
  ChartLiveEvent,
  ChartLiveStatus,
  LivePendingOrderPayload,
  LivePositionPayload,
} from "@/lib/chart/liveContract";

export const TICK_INTERVAL_MS = 1_000;
export const CANDLE_INTERVAL_MS = 5_000;
export const POSITIONS_INTERVAL_MS = 8_000;
export const HEARTBEAT_INTERVAL_MS = 4_000;
export const DELAYED_THRESHOLD_FAILURES = 3;

/** Self-hosted Node keeps SSE open; a 50s cap remains only if VERCEL is set. */
export function chartSseMaxDurationMs(): number {
  if (process.env.VERCEL) return 50_000;
  const override = Number(process.env.CHART_SSE_MAX_MS ?? "");
  if (Number.isFinite(override) && override > 5_000) return override;
  return 10 * 60_000;
}

export type ChartLivePollerArgs = {
  userId: string;
  accountId: string;
  displaySymbol: string;
  brokerSymbol: string;
  timeframeKey: string;
  metaAccountId: string;
  accountRegion: string | null;
  emit: (event: ChartLiveEvent) => void;
  isStopped: () => boolean;
  /**
   * True while a streamer is pushing real ticks into this room. The REST loops
   * then idle instead of duplicating (and paying for) what already arrives.
   */
  pushActive?: () => boolean;
  /** Cap stream lifetime. Omit (or 0) to run until isStopped(). */
  maxDurationMs?: number;
};

export function mapPositionSide(t: string | undefined): string {
  const u = (t ?? "").toUpperCase();
  if (u.includes("BUY")) return "buy";
  if (u.includes("SELL")) return "sell";
  return (t ?? "").toLowerCase();
}

export function mapOrderType(t: string | undefined): string {
  const raw = (t ?? "").toLowerCase().replace(/_/g, " ");
  if (raw.includes("buy") && raw.includes("limit")) return "buy_limit";
  if (raw.includes("sell") && raw.includes("limit")) return "sell_limit";
  if (raw.includes("buy") && raw.includes("stop")) return "buy_stop";
  if (raw.includes("sell") && raw.includes("stop")) return "sell_stop";
  return raw.trim() || "pending";
}

export function mapOrderSide(type: string): string {
  if (type.startsWith("buy")) return "buy";
  if (type.startsWith("sell")) return "sell";
  return "unknown";
}

function sleep(ms: number, isStopped: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (isStopped()) {
      clearTimeout(timer);
      resolve();
    }
  });
}

export async function runChartLivePoller(args: ChartLivePollerArgs): Promise<void> {
  const {
    userId,
    accountId,
    displaySymbol,
    brokerSymbol,
    timeframeKey,
    metaAccountId,
    accountRegion,
    emit,
    isStopped,
    maxDurationMs = 0,
    pushActive,
  } = args;
  const tf = metaApiTimeframeFromKey(timeframeKey);
  const startedAt = Date.now();

  function timedOut(): boolean {
    if (isStopped()) return true;
    if (maxDurationMs && maxDurationMs > 0 && Date.now() - startedAt >= maxDurationMs) return true;
    return false;
  }

  emit({
    type: "ready",
    userId,
    accountId,
    displaySymbol,
    brokerSymbol,
    timeframe: tf,
    source: "metaapi_mt5",
  });

  let consecutiveTickFailures = 0;
  let lastStatus: ChartLiveStatus | null = null;

  function setStatus(next: ChartLiveStatus, reason?: string) {
    if (next === lastStatus) return;
    lastStatus = next;
    emit({ type: "live_status", status: next, reason });
  }

  async function tickLoop() {
    while (!timedOut()) {
      if (pushActive?.()) {
        setStatus("live");
        await sleep(TICK_INTERVAL_MS, timedOut);
        continue;
      }
      try {
        const price = await clientGetSymbolPrice(metaAccountId, brokerSymbol, accountRegion);
        const mid =
          price.bid != null && price.ask != null
            ? (price.bid + price.ask) / 2
            : price.bid ?? price.ask;
        emit({
          type: "tick",
          userId,
          accountId,
          displaySymbol,
          brokerSymbol,
          bid: price.bid,
          ask: price.ask,
          price: mid != null ? Number(mid) : null,
          timestamp: price.brokerTime ?? price.time,
          source: "metaapi_mt5",
        });
        consecutiveTickFailures = 0;
        setStatus("live");
      } catch (e) {
        consecutiveTickFailures += 1;
        if (e instanceof MetaApiRequestError && e.code === "not_found") {
          setStatus("error", "broker_symbol_not_found");
          return;
        }
        if (consecutiveTickFailures >= DELAYED_THRESHOLD_FAILURES) {
          setStatus("delayed", "tick_unavailable");
        }
      }
      await sleep(TICK_INTERVAL_MS, timedOut);
    }
  }

  async function candleLoop() {
    await sleep(2_000, timedOut);
    while (!timedOut()) {
      if (pushActive?.()) {
        await sleep(CANDLE_INTERVAL_MS, timedOut);
        continue;
      }
      try {
        const candles = await clientGetHistoricalCandles(
          metaAccountId,
          brokerSymbol,
          tf,
          2,
          accountRegion,
        );
        const last = candles[candles.length - 1];
        if (last) {
          emit({
            type: "candle_update",
            userId,
            accountId,
            displaySymbol,
            brokerSymbol,
            timeframe: tf,
            candle: last,
            patch: true,
            source: "metaapi_mt5",
          });
        }
      } catch {
        /* tick stream still informative */
      }
      await sleep(CANDLE_INTERVAL_MS, timedOut);
    }
  }

  async function positionsLoop() {
    await sleep(3_000, timedOut);
    while (!timedOut()) {
      try {
        const raw = (await clientGetPositions(
          metaAccountId,
          false,
          accountRegion,
        )) as Record<string, unknown>[];
        const onSymbol: LivePositionPayload[] = raw
          .filter((p) => String(p.symbol ?? "") === brokerSymbol)
          .map((p, i) => ({
            id: String(p.id ?? p.positionId ?? i),
            symbol: String(p.symbol ?? ""),
            side: mapPositionSide(typeof p.type === "string" ? p.type : undefined),
            volume: Number(p.volume ?? 0) || 0,
            entryPrice: p.openPrice != null ? Number(p.openPrice) : null,
            currentPrice:
              p.currentPrice != null ? Number(p.currentPrice) : p.price != null ? Number(p.price) : null,
            profit:
              p.profit != null
                ? Number(p.profit)
                : p.unrealizedProfit != null
                  ? Number(p.unrealizedProfit)
                  : null,
            stopLoss: p.stopLoss != null ? Number(p.stopLoss) : null,
            takeProfit: p.takeProfit != null ? Number(p.takeProfit) : null,
            openTime: (p.time as string) ?? (p.updateTime as string) ?? null,
          }));
        emit({
          type: "positions_update",
          userId,
          accountId,
          total: raw.length,
          onSymbol,
          source: "metaapi_mt5",
        });
      } catch {
        /* keep stream alive */
      }
      await sleep(POSITIONS_INTERVAL_MS, timedOut);
    }
  }

  async function ordersLoop() {
    await sleep(5_000, timedOut);
    while (!timedOut()) {
      try {
        const raw = (await clientGetOrders(
          metaAccountId,
          false,
          accountRegion,
        )) as Record<string, unknown>[];
        const onSymbol: LivePendingOrderPayload[] = raw
          .filter((o) => String(o.symbol ?? "") === brokerSymbol)
          .map((o, i) => {
            const type = mapOrderType(typeof o.type === "string" ? o.type : undefined);
            return {
              id: String(o.id ?? o.orderId ?? i),
              symbol: String(o.symbol ?? ""),
              type,
              side: mapOrderSide(type),
              volume: Number(o.volume ?? 0) || 0,
              openPrice: Number(o.openPrice ?? o.price ?? 0),
              currentPrice: o.currentPrice != null ? Number(o.currentPrice) : null,
              stopLoss: o.stopLoss != null ? Number(o.stopLoss) : null,
              takeProfit: o.takeProfit != null ? Number(o.takeProfit) : null,
              openTime: (o.time as string) ?? (o.doneTime as string) ?? null,
            };
          });
        emit({
          type: "orders_update",
          userId,
          accountId,
          total: raw.length,
          onSymbol,
          source: "metaapi_mt5",
        });
      } catch {
        /* keep stream alive */
      }
      await sleep(POSITIONS_INTERVAL_MS, timedOut);
    }
  }

  async function heartbeatLoop() {
    while (!timedOut()) {
      await sleep(HEARTBEAT_INTERVAL_MS, timedOut);
      if (!timedOut()) emit({ type: "heartbeat" });
    }
  }

  await Promise.allSettled([tickLoop(), candleLoop(), positionsLoop(), ordersLoop(), heartbeatLoop()]);
}
