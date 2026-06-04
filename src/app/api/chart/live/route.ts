import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientGetHistoricalCandles,
  clientGetPositions,
  clientGetSymbolPrice,
  MetaApiRequestError,
} from "@/lib/mt5/metaApiClient";
import { metaApiTimeframeFromKey, normalizeChartTfKey } from "@/lib/broker/chartTimeframes";
import type {
  ChartLiveEvent,
  ChartLiveStatus,
  LivePositionPayload,
} from "@/lib/chart/liveContract";
import { loadEconomicCalendar } from "@/lib/market/calendarProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE fallback for the chart live stream.
 *
 * Same normalized event contract as the Cloudflare ChartLiveRoom websocket
 * (see src/lib/chart/liveContract.ts). The browser uses one parser for both.
 *
 * Phase 11 rewrite: tick, candle, and position polls now run as independent
 * concurrent intervals instead of blocking each other sequentially. This
 * prevents a slow candle/position fetch from starving the tick stream.
 */

const TICK_INTERVAL_MS = 1_000;
const CANDLE_INTERVAL_MS = 5_000;
const POSITIONS_INTERVAL_MS = 8_000;
const HEARTBEAT_INTERVAL_MS = 4_000;
const MAX_DURATION_MS = 50_000;
const DELAYED_THRESHOLD_FAILURES = 3;

function encodeSse(event: ChartLiveEvent): string {
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
  const requestedDisplaySymbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const brokerSymbolParam = (url.searchParams.get("broker") ?? "").trim();
  const tfKey = normalizeChartTfKey(url.searchParams.get("tf") ?? undefined);
  const tf = metaApiTimeframeFromKey(tfKey);

  const supabase = await createServerSupabaseClient();
  if (!supabase) return new Response("supabase_not_configured", { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  // Capture after null guard so TS narrows inside closures (tickLoop / candleLoop).
  const userId = user.id;

  if (!getMetaApiToken()) {
    return new Response("provider_not_configured", { status: 503 });
  }

  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,external_connection_id,metadata")
    .eq("user_id", user.id)
    .eq("id", accountIdParam)
    .maybeSingle();

  if (
    !account ||
    account.connection_method !== "cloud_mt5" ||
    typeof account.external_connection_id !== "string" ||
    !account.external_connection_id
  ) {
    return new Response("account_not_connected", { status: 404 });
  }
  const accountId = account.id as string;

  if (!requestedDisplaySymbol) {
    return new Response("symbol_required", { status: 400 });
  }

  const brokerSymbol = brokerSymbolParam || requestedDisplaySymbol;
  const metaAccountId = account.external_connection_id;
  const accountMeta =
    account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
      ? (account.metadata as Record<string, unknown>)
      : {};
  const accountRegion =
    typeof accountMeta.metaapiRegion === "string" ? accountMeta.metaapiRegion : null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let closed = false;

      function send(p: ChartLiveEvent) {
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
        userId,
        accountId,
        displaySymbol: requestedDisplaySymbol,
        brokerSymbol,
        timeframe: tf,
        source: "metaapi_mt5",
      });

      // ── Push high-impact calendar events via the existing channel ────
      try {
        const events = await loadEconomicCalendar({
          symbol: requestedDisplaySymbol,
          daysAhead: 1,
          limit: 5,
        });
        const soon = Date.now() + 30 * 60 * 1000;
        for (const evt of events) {
          if (evt.impact !== "high") continue;
          const t = Date.parse(evt.startsAt);
          if (!Number.isFinite(t) || t > soon) continue;
          send({
            type: "market_alert",
            alertKind: "calendar",
            title: evt.title,
            impact: "high",
            currency: evt.currency ?? null,
            startsAt: evt.startsAt,
            source: "finnhub",
          });
        }
      } catch {
        /* calendar check is best-effort */
      }

      let consecutiveTickFailures = 0;
      let lastStatus: ChartLiveStatus | null = null;

      function setStatus(next: ChartLiveStatus, reason?: string) {
        if (next === lastStatus) return;
        lastStatus = next;
        send({ type: "live_status", status: next, reason });
      }

      // ── Independent concurrent poll loops ──────────────────────────
      // Each data type runs on its own interval. A slow positions fetch
      // no longer blocks tick updates from reaching the client.

      async function tickLoop() {
        while (!closed && Date.now() - startedAt < MAX_DURATION_MS) {
          try {
            const price = await clientGetSymbolPrice(metaAccountId, brokerSymbol, accountRegion);
            const mid =
              price.bid != null && price.ask != null
                ? (price.bid + price.ask) / 2
                : price.bid ?? price.ask;
            send({
              type: "tick",
              userId,
              accountId,
              displaySymbol: requestedDisplaySymbol,
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
              close();
              return;
            }
            if (consecutiveTickFailures >= DELAYED_THRESHOLD_FAILURES) {
              setStatus("delayed", "tick_unavailable");
            }
          }
          await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
        }
      }

      async function candleLoop() {
        // Initial delay so first tick arrives before candle fetch
        await new Promise((r) => setTimeout(r, 2_000));
        while (!closed && Date.now() - startedAt < MAX_DURATION_MS) {
          try {
            const candles = await clientGetHistoricalCandles(
              metaAccountId,
              brokerSymbol,
              tf,
              2,
              accountRegion,
            );
            const last = candles[candles.length - 1];
            if (last)
              send({
                type: "candle_update",
                userId,
                accountId,
                displaySymbol: requestedDisplaySymbol,
                brokerSymbol,
                timeframe: tf,
                candle: last,
                patch: true,
                source: "metaapi_mt5",
              });
          } catch {
            /* ignore — tick stream still informative */
          }
          await new Promise((r) => setTimeout(r, CANDLE_INTERVAL_MS));
        }
      }

      async function positionsLoop() {
        // Initial delay — positions are lower priority than ticks
        await new Promise((r) => setTimeout(r, 3_000));
        while (!closed && Date.now() - startedAt < MAX_DURATION_MS) {
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
            send({
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
          await new Promise((r) => setTimeout(r, POSITIONS_INTERVAL_MS));
        }
      }

      async function heartbeatLoop() {
        while (!closed && Date.now() - startedAt < MAX_DURATION_MS) {
          await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS));
          send({ type: "heartbeat" });
        }
      }

      // Fire all loops concurrently — they each manage their own interval
      await Promise.allSettled([
        tickLoop(),
        candleLoop(),
        positionsLoop(),
        heartbeatLoop(),
      ]);

      close();
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
