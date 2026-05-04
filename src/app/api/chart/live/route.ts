import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetHistoricalCandles,
  clientGetPositions,
  clientGetSymbolPrice,
  MetaApiRequestError,
  type MetaApiCandle,
} from "@/lib/mt5/metaApiClient";
import { metaApiTimeframeFromKey, normalizeChartTfKey } from "@/lib/broker/chartTimeframes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events live channel for the chart.
 *
 * Architecture:
 *   MetaApi REST (current-price, positions, last candle)
 *     → server SSE loop here
 *     → browser EventSource → ChartCanvas live patch
 *
 * Why SSE instead of socket.io?
 * - Vercel-friendly: no long-lived process required.
 * - Loop bounded by `MAX_DURATION_MS`; the client auto-reconnects.
 * - Falls back to plain REST in the page loader when SSE is unavailable.
 *
 * Future hardening: swap REST polling for MetaApi streaming SDK in a long-running worker
 * and forward via Supabase Realtime/broadcast — public payload shape stays the same.
 */

const TICK_INTERVAL_MS = 2_500;
const CANDLE_INTERVAL_MS = 12_000;
const POSITIONS_INTERVAL_MS = 8_000;
const MAX_DURATION_MS = 50_000;

type SsePayload =
  | { type: "ready"; account: { id: string; label: string }; brokerSymbol: string; timeframe: string }
  | {
      type: "tick";
      symbol: string;
      bid: number | null;
      ask: number | null;
      mid: number | null;
      time: string | null;
    }
  | { type: "candle-update"; candle: MetaApiCandle }
  | {
      type: "positions";
      total: number;
      onSymbol: Array<{
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
      }>;
    }
  | { type: "status"; status: "live" | "delayed" | "failed" | "connected"; reason?: string }
  | { type: "ping" };

function encodeSse(event: SsePayload): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function mapSide(t: string | undefined): string {
  const u = (t ?? "").toUpperCase();
  if (u.includes("BUY")) return "buy";
  if (u.includes("SELL")) return "sell";
  return (t ?? "").toLowerCase();
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const accountIdParam = url.searchParams.get("account") ?? "";
  const requestedSymbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const tfKey = normalizeChartTfKey(url.searchParams.get("tf") ?? undefined);
  const tf = metaApiTimeframeFromKey(tfKey);

  const supabase = await createServerSupabaseClient();
  if (!supabase) return new Response("supabase-not-configured", { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  if (!getMetaApiToken()) {
    return new Response("provider-not-configured", { status: 503 });
  }

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,label,connection_method,external_connection_id")
    .eq("user_id", user.id)
    .eq("id", accountIdParam)
    .maybeSingle();

  if (
    !account ||
    account.connection_method !== "cloud_mt5" ||
    typeof account.external_connection_id !== "string" ||
    !account.external_connection_id
  ) {
    return new Response("account-not-connected", { status: 404 });
  }

  if (!requestedSymbol) {
    return new Response("symbol-required", { status: 400 });
  }

  const metaAccountId = account.external_connection_id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let closed = false;

      function send(p: SsePayload) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSse(p)));
        } catch {
          closed = true;
        }
      }

      function close() {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

      request.signal.addEventListener("abort", () => close());

      send({
        type: "ready",
        account: { id: account.id as string, label: (account.label as string) ?? "MT5 Account" },
        brokerSymbol: requestedSymbol,
        timeframe: tf,
      });

      let lastTickAt = 0;
      let lastCandleAt = 0;
      let lastPositionsAt = 0;
      let consecutiveTickFailures = 0;
      let lastStatus: "live" | "delayed" | "failed" | "connected" = "connected";

      function setStatus(next: "live" | "delayed" | "failed" | "connected", reason?: string) {
        if (next === lastStatus) return;
        lastStatus = next;
        send({ type: "status", status: next, reason });
      }

      while (!closed) {
        if (Date.now() - startedAt > MAX_DURATION_MS) {
          send({ type: "ping" });
          close();
          break;
        }

        const now = Date.now();

        if (now - lastTickAt >= TICK_INTERVAL_MS) {
          lastTickAt = now;
          try {
            const price = await clientGetSymbolPrice(metaAccountId, requestedSymbol);
            const mid =
              price.bid != null && price.ask != null
                ? (price.bid + price.ask) / 2
                : price.bid ?? price.ask;
            send({
              type: "tick",
              symbol: requestedSymbol,
              bid: price.bid,
              ask: price.ask,
              mid: mid != null ? Number(mid) : null,
              time: price.brokerTime ?? price.time,
            });
            consecutiveTickFailures = 0;
            setStatus("live");
          } catch (e) {
            consecutiveTickFailures += 1;
            if (e instanceof MetaApiRequestError && e.code === "not_found") {
              setStatus("failed", "broker_symbol_not_found");
              close();
              break;
            }
            if (consecutiveTickFailures >= 3) {
              setStatus("delayed", "tick_unavailable");
            }
          }
        }

        if (now - lastCandleAt >= CANDLE_INTERVAL_MS) {
          lastCandleAt = now;
          try {
            const candles = await clientGetHistoricalCandles(metaAccountId, requestedSymbol, tf, 2);
            const last = candles[candles.length - 1];
            if (last) send({ type: "candle-update", candle: last });
          } catch {
            /* ignore — tick stream still informative */
          }
        }

        if (now - lastPositionsAt >= POSITIONS_INTERVAL_MS) {
          lastPositionsAt = now;
          try {
            const raw = (await clientGetPositions(metaAccountId, false)) as Record<string, unknown>[];
            const onSymbol = raw
              .filter((p) => String(p.symbol ?? "") === requestedSymbol)
              .map((p, i) => ({
                id: String(p.id ?? p.positionId ?? i),
                symbol: String(p.symbol ?? ""),
                side: mapSide(typeof p.type === "string" ? (p.type as string) : undefined),
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
            send({ type: "positions", total: raw.length, onSymbol });
          } catch {
            /* keep stream alive */
          }
        }

        await new Promise((r) => setTimeout(r, 750));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
