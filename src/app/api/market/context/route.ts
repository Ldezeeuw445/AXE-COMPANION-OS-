import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWatchlistItems } from "@/app/(app)/settings/actions";
import { buildMarketContext } from "@/lib/market/marketContextService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated market context for the active user.
 *
 * Body:
 *   { symbol?: string }   — defaults to XAUUSD
 */

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  let body: { symbol?: string } = {};
  try {
    body = (await request.json()) as { symbol?: string };
  } catch {
    /* allow empty body */
  }

  const watchlist = (await listWatchlistItems()).map((w) => w.symbol);
  const ctx = await buildMarketContext({
    symbol: body.symbol ?? "XAUUSD",
    watchlist,
  });

  return Response.json(ctx);
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
