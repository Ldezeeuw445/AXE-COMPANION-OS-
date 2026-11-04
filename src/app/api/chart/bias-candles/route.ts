import type { NextRequest } from "next/server";

import { fetchTimeframeFromKey, isFoldedTimeframe, normalizeChartTfKey } from "@/lib/broker/chartTimeframes";
import { foldIsoCandles } from "@/lib/chart/aggregateCandles";
import { resolveSessionZone } from "@/lib/chart/sessionDay";
import {
  BIAS_CANDLE_COUNT,
  companionTimeframe,
  isUsablePair,
} from "@/lib/chart/stackedTimeframes";
import { clientGetHistoricalCandles } from "@/lib/mt5/metaApiClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De candles voor de bovenste chart als er twee boven elkaar staan.
 *
 * Punt 16 van de rij. Een eigen route en niet een tweede fetch in
 * `loadChartPageData`, om één reden: die functie heeft een stuk of acht
 * returnpaden, en elk pad een veld erbij geven is acht kansen om de
 * hoofdchart te breken voor een paneel dat erbovenop komt. Dit is additief —
 * gaat de route stuk, dan staat er geen bias-chart en werkt de rest gewoon.
 *
 * Welke timeframe erboven hoort beslist `companionTimeframe`: een verhouding,
 * geen plek in een lijst. Zie src/lib/chart/stackedTimeframes.ts.
 */
function jsonError(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account")?.trim();
  const brokerSymbol = url.searchParams.get("symbol")?.trim();
  const executionKey = normalizeChartTfKey(url.searchParams.get("tf") ?? undefined);
  const requestedBias = url.searchParams.get("bias")?.trim() || null;

  if (!accountId || !brokerSymbol) return jsonError(400, "missing_fields");

  const biasKey = requestedBias ? normalizeChartTfKey(requestedBias) : companionTimeframe(executionKey);
  // Geen bias boven de grofste timeframe, en een zelfgekozen bias die niet
  // echt grover is wordt geweigerd in plaats van twee keer hetzelfde plaatje
  // op te leveren.
  if (!biasKey || !isUsablePair(biasKey, executionKey)) {
    return Response.json({ ok: true, biasKey: null, candles: [] });
  }

  // Eigendom controleren vóór er iets bij MetaApi wordt opgehaald: anders kan
  // iemand met een geldige sessie de candles van andermans rekening trekken
  // door een ander account-id mee te geven.
  const { data: account } = await supabase
    .from("user_broker_accounts")
    .select("id,external_connection_id,metadata")
    .eq("user_id", user.id)
    .eq("id", accountId)
    .maybeSingle();

  if (!account?.external_connection_id) return jsonError(404, "account_not_found");

  const meta =
    account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
      ? (account.metadata as Record<string, unknown>)
      : {};
  const region = typeof meta.metaapiRegion === "string" ? meta.metaapiRegion : null;
  const brokerTimezone = typeof meta.brokerTimezone === "string" ? meta.brokerTimezone : null;

  try {
    const raw = await clientGetHistoricalCandles(
      account.external_connection_id,
      brokerSymbol,
      fetchTimeframeFromKey(biasKey),
      BIAS_CANDLE_COUNT,
      region,
    );

    // W1 en MN1 komen als dagcandles binnen en worden hier gevouwen, net als
    // op de hoofdchart.
    const candles = isFoldedTimeframe(biasKey)
      ? foldIsoCandles(raw, resolveSessionZone(brokerTimezone), biasKey === "mn1" ? "mn1" : "w1")
      : raw;

    return Response.json({ ok: true, biasKey, candles });
  } catch (e) {
    // Geen bias-chart is geen reden om de hoofdchart te laten struikelen.
    return Response.json(
      { ok: false, biasKey, candles: [], error: e instanceof Error ? e.message : "candles_failed" },
      { status: 200 },
    );
  }
}
