import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { normalizeChartTfKey } from "@/lib/broker/chartTimeframes";
import type { ChartLiveEvent } from "@/lib/chart/liveContract";
import { chartSseMaxDurationMs, runChartLivePoller } from "@/lib/chart/livePoller";
import { loadEconomicCalendar } from "@/lib/market/calendarProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE fallback for the chart live stream.
 *
 * Same normalized event contract as `/ws/chart` and Cloudflare ChartLiveRoom.
 * Prefer the websocket; this route is the safety net when upgrade fails.
 */

function encodeSse(event: ChartLiveEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const accountIdParam = url.searchParams.get("account") ?? "";
  const requestedDisplaySymbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const brokerSymbolParam = (url.searchParams.get("broker") ?? "").trim();
  const tfKey = normalizeChartTfKey(url.searchParams.get("tf") ?? undefined);

  const supabase = await createServerSupabaseClient();
  if (!supabase) return new Response("supabase_not_configured", { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
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

      try {
        const events = await loadEconomicCalendar({
          symbol: requestedDisplaySymbol,
          daysAhead: 1,
          limit: 5,
        });
        const soon = Date.now() + 30 * 60_000;
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

      await runChartLivePoller({
        userId,
        accountId,
        displaySymbol: requestedDisplaySymbol,
        brokerSymbol,
        timeframeKey: tfKey,
        metaAccountId,
        accountRegion,
        emit: send,
        isStopped: () => closed,
        maxDurationMs: chartSseMaxDurationMs(),
      });

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
