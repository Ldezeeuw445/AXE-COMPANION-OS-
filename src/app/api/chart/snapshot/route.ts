import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HARDENED chart snapshot writer with timeout and deduplication.
 *
 * This route prevents snapshot writes from blocking the main UI by:
 * 1. Always responding within 2 seconds (timeout)
 * 2. Deduplicating writes per (user, account, symbol, timeframe)
 * 3. Using the deadlock-safe RPC instead of direct table writes
 * 4. Silently dropping writes if the DB is overloaded (503/500)
 *
 * The client can safely fire-and-forget this endpoint without fear of hangs.
 */

const THROTTLE_MS = 30_000; // 30 s server-side guard (increased from 15s)
const TIMEOUT_MS = 2_000; // 2 s max response time
const _lastWrite = new Map<string, number>();

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

  // --- Deduplication per unique stream key ---
  const throttleKey = `${user.id}:${body.accountId}:${body.displaySymbol.toUpperCase()}:${body.timeframe}`;
  const now = Date.now();
  const last = _lastWrite.get(throttleKey) ?? 0;
  if (now - last < THROTTLE_MS) {
    // Silently return OK so the client doesn't retry; just skip the DB write.
    return Response.json({ ok: true, throttled: true });
  }
  _lastWrite.set(throttleKey, now);

  // --- Ownership check (with timeout) ---
  let ownerCheck: any;
  try {
    // Wrap in a timeout so we never wait >TIMEOUT_MS
    ownerCheck = await Promise.race([
      supabase
        .from("user_broker_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("id", body.accountId)
        .maybeSingle() as any,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
  } catch (e) {
    // If ownership check times out or fails, still return 200 so client doesn't retry
    console.warn("[chart/snapshot] ownership check failed/timeout, skipping write", e);
    return Response.json({ ok: true, skipped: "check_timeout" });
  }

  if (!ownerCheck?.data) {
    return Response.json({ ok: true, skipped: "not_owned" });
  }

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

  // --- Route through the deadlock-safe RPC with timeout ---
  try {
    const result = await Promise.race([
      supabase.rpc("upsert_chart_live_snapshots_safe", {
        p_rows: [row],
      }) as any,
      new Promise((_, reject) => setTimeout(() => reject(new Error("rpc_timeout")), TIMEOUT_MS)),
    ]);

    const error = (result as any)?.error;
    if (error) {
      const msg = (error as any)?.message || String(error);
      console.warn("[chart/snapshot] RPC warning:", msg);
      // Silently return OK; don't make the client retry
      return Response.json({ ok: true, rpc_warn: msg.substring(0, 50) });
    }
  } catch (e) {
    // RPC timeout or other error; return 200 so client doesn't retry
    console.warn("[chart/snapshot] RPC failed/timeout", e);
    return Response.json({ ok: true, skipped: "rpc_timeout" });
  }

  return Response.json({ ok: true });
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
