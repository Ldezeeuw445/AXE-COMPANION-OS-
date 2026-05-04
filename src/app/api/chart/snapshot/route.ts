import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated audit writer for the chart live stream.
 *
 * Upserts the latest known snapshot for (user, account, displaySymbol, timeframe).
 * Intentionally bounded so one row per stream — the audit table stays cheap.
 *
 * The browser calls this opportunistically (every ~30s while the WS is live and
 * the tab is visible). The Node streamer can also call it when configured.
 */

type SnapshotBody = {
  accountId: string;
  displaySymbol: string;
  brokerSymbol: string;
  timeframe: string;
  lastPrice?: number | null;
  lastBid?: number | null;
  lastAsk?: number | null;
  lastTickAt?: string | null;
  lastCandleAt?: string | null;
  lastCandle?: Record<string, unknown> | null;
  openPositionsCount?: number | null;
  openPositions?: Record<string, unknown>[] | null;
  status?: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  let body: SnapshotBody;
  try {
    body = (await request.json()) as SnapshotBody;
  } catch {
    return jsonError(400, "invalid_body");
  }

  if (!body.accountId || !body.displaySymbol || !body.brokerSymbol || !body.timeframe) {
    return jsonError(400, "missing_fields");
  }

  // Verify the user actually owns this account row before recording a snapshot.
  const { data: ownerCheck } = await supabase
    .from("user_broker_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", body.accountId)
    .maybeSingle();

  if (!ownerCheck) return jsonError(404, "account_not_found");

  const row = {
    user_id: user.id,
    account_id: body.accountId,
    display_symbol: body.displaySymbol.toUpperCase(),
    broker_symbol: body.brokerSymbol,
    timeframe: body.timeframe,
    last_price: body.lastPrice ?? null,
    last_bid: body.lastBid ?? null,
    last_ask: body.lastAsk ?? null,
    last_tick_at: body.lastTickAt ?? null,
    last_candle_at: body.lastCandleAt ?? null,
    last_candle: body.lastCandle ?? null,
    open_positions_count: body.openPositionsCount ?? null,
    open_positions: body.openPositions ?? null,
    status: body.status ?? null,
    source: "metaapi_mt5",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("chart_live_snapshots")
    .upsert(row, { onConflict: "user_id,account_id,display_symbol,timeframe" });

  if (error) {
    if (error.message.toLowerCase().includes("does not exist")) {
      return jsonError(503, "snapshot_table_missing");
    }
    return jsonError(500, "snapshot_failed");
  }
  return Response.json({ ok: true });
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
