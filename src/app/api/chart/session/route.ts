import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signChartSessionToken } from "@/lib/chart/sessionToken";
import { normalizeChartTfKey } from "@/lib/broker/chartTimeframes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived signed token (HS256) the browser passes to the
 * Cloudflare ChartLiveRoom websocket. Cloudflare verifies with the same secret.
 *
 * Body: { accountId, displaySymbol, brokerSymbol, timeframe }
 * Returns: { token, wsUrl, expiresIn } — wsUrl is `null` when no WS edge is configured;
 *           caller should fall back to /api/chart/live SSE.
 */

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  let body: {
    accountId?: string;
    displaySymbol?: string;
    brokerSymbol?: string;
    timeframe?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "invalid_body");
  }

  const accountId = String(body.accountId ?? "").trim();
  const displaySymbol = String(body.displaySymbol ?? "").trim().toUpperCase();
  const brokerSymbol = String(body.brokerSymbol ?? "").trim();
  const timeframe = normalizeChartTfKey(body.timeframe);

  if (!accountId || !displaySymbol || !brokerSymbol) {
    return jsonError(400, "missing_fields");
  }

  const { data: account, error } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method,external_connection_id")
    .eq("user_id", user.id)
    .eq("id", accountId)
    .maybeSingle();

  if (error) return jsonError(500, "lookup_failed");
  if (
    !account ||
    account.connection_method !== "cloud_mt5" ||
    typeof account.external_connection_id !== "string" ||
    !account.external_connection_id
  ) {
    return jsonError(404, "account_not_connected");
  }

  const secret = process.env.CHART_SESSION_JWT_SECRET ?? "";
  const wsBase = (process.env.NEXT_PUBLIC_CHART_WS_URL ?? "").trim();

  if (!secret || !wsBase) {
    // No realtime edge configured — caller will fall back to SSE.
    return Response.json({
      token: null,
      wsUrl: null,
      expiresIn: 0,
      reason: !secret ? "no_secret" : "no_ws_url",
    });
  }

  const { token, expiresIn } = await signChartSessionToken(
    {
      userId: user.id,
      accountId,
      metaApiAccountId: account.external_connection_id,
      displaySymbol,
      brokerSymbol,
      timeframe,
      ttlSeconds: 120,
    },
    secret,
  );

  return Response.json({ token, wsUrl: wsBase, expiresIn });
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
