import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import { syncAccountsMissingSymbolMap, syncStaleMt5Accounts } from "@/lib/mt5/backgroundSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron — background MT5 sync for stale cloud accounts.
 *
 * Secured with CRON_SECRET (Vercel sends Authorization: Bearer <CRON_SECRET>).
 * Set CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY + METAAPI_TOKEN on the deployment.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!getMetaApiToken()) {
    return Response.json({ error: "metaapi_not_configured" }, { status: 503 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "supabase_service_role_missing" }, { status: 503 });
  }

  const symbolMapSummary = await syncAccountsMissingSymbolMap(supabase, { maxAccounts: 5 });
  const summary = await syncStaleMt5Accounts(supabase, { maxAccounts: 5, minAgeMs: 10 * 60 * 1000 });
  return Response.json({ ok: true, symbolMapSummary, ...summary });
}
