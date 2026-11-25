import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { runBridgeQuoteLoop } from "@/lib/mt5/bridgeQuotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Host cron, every minute — live prices for accounts on our own MT5 bridge.
 *
 * Runs for about 55 seconds, asking the bridge for current prices and writing
 * them to `chart_live_snapshots`, the table both apps read live prices from.
 * See src/lib/mt5/bridgeQuotes.ts for why this exists. Secured with
 * CRON_SECRET like the other sweeps; `axe_ops.dispatch_cron` waits up to 120 s
 * for the answer, which carries the summary.
 */
let running = false;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // A slow minute must not start a second loop next to the first.
  if (running) return Response.json({ ok: true, skipped: "already_running" });

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "supabase_service_role_missing" }, { status: 503 });
  }

  running = true;
  try {
    const summary = await runBridgeQuoteLoop(supabase);
    return Response.json(summary);
  } finally {
    running = false;
  }
}
