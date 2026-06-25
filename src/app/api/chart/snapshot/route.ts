import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated audit writer for the chart live stream.
 *
 * Routes writes through the deadlock-safe RPC
 * `upsert_chart_live_snapshots_safe(p_rows jsonb)` instead of directly
 * hitting the PostgREST table endpoint.  The RPC:
 *   - acquires deterministic advisory locks per key (sorted → no deadlocks)
 *   - skips updates where incoming updated_at < existing updated_at (stale guard)
 *
 * Server-side throttle: one write per (user, account, symbol, timeframe) per
 * THROTTLE_MS window.  The browser already calls this every ~60 s, so the
 * throttle only fires if something hammers the endpoint unexpectedly.
 */

const THROTTLE_MS = 15_000; // 15 s server-side guard
const _lastWrite = new Map<string, number>(); // throttle state (per instance)

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

  // --- Server-side throttle per unique stream key ---
  const throttleKey = `${user.id}:${body.accountId}:${body.displaySymbol.toUpperCase()}:${body.timeframe}`;
  const now = Date.now();
  const last = _lastWrite.get(throttleKey) ?? 0;
  if (now - last < THROTTLE_MS) {
    // Return 200 so the client doesn't retry; just skip the DB write.
    return Response.json({ ok: true, throttled: true });
  }
  _lastWrite.set(throttleKey, now);

  // --- Ownership check ---
  const { data: ownerCheck } = await supabase
    .from("user_broker_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", body.accountId)
    .maybeSingle();

  if (!ownerCheck) return jsonError(404, "account_not_found");

  // --- Build the row for the RPC ---
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

  // --- Route through the deadlock-safe RPC (p_rows is a JSON array) ---
  const { error } = await supabase.rpc("upsert_chart_live_snapshots_safe", {
    p_rows: [row],
  });

  if (error) {
    console.error("[chart/snapshot] RPC error:", error.message);
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
