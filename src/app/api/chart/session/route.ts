import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signChartSessionToken } from "@/lib/chart/sessionToken";
import { normalizeChartTfKey } from "@/lib/broker/chartTimeframes";
import {
  DEFAULT_CLOUDFLARE_CHART_WS_URL,
  getChartSessionSecret,
  getExplicitChartWsUrl,
} from "@/lib/chart/chartSessionSecret";
import { sameOriginChartWsUrl } from "@/lib/chart/sameOriginWsUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived signed token (HS256) the browser passes to a chart websocket.
 *
 * Preference:
 *   1. Same-origin `/ws/chart` on this Node process (no extra env required)
 *   2. Explicit Cloudflare URL (`CHART_WS_URL` / `NEXT_PUBLIC_CHART_WS_URL`)
 *
 * Returns: { token, wsUrl, fallbackWsUrl, expiresIn }
 * wsUrl is `null` only when we cannot sign a token; caller falls back to SSE.
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
    .select("id,connection_method,external_connection_id,metadata")
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

  const { secret, source } = getChartSessionSecret();
  if (!secret) {
    return Response.json({
      token: null,
      wsUrl: null,
      fallbackWsUrl: null,
      expiresIn: 0,
      reason: "no_secret",
    });
  }

  const accountMeta =
    account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
      ? (account.metadata as Record<string, unknown>)
      : {};
  const metaapiRegion =
    typeof accountMeta.metaapiRegion === "string" && accountMeta.metaapiRegion.trim()
      ? accountMeta.metaapiRegion.trim()
      : undefined;

  const { token, expiresIn } = await signChartSessionToken(
    {
      userId: user.id,
      accountId,
      metaApiAccountId: account.external_connection_id,
      metaapiRegion,
      displaySymbol,
      brokerSymbol,
      timeframe,
      ttlSeconds: 120,
    },
    secret,
  );

  const sameOrigin = sameOriginChartWsUrl(request);
  const explicit = getExplicitChartWsUrl();
  const cloudflareFallback = source === "env" ? explicit || DEFAULT_CLOUDFLARE_CHART_WS_URL : explicit;

  const wsUrl = sameOrigin || cloudflareFallback || null;
  const fallbackWsUrl =
    cloudflareFallback && wsUrl && cloudflareFallback.replace(/\/$/, "") !== wsUrl.replace(/\/$/, "")
      ? cloudflareFallback
      : null;

  return Response.json({
    token,
    wsUrl,
    fallbackWsUrl,
    expiresIn,
    reason: sameOrigin ? "same_origin" : source === "env" ? "cloudflare" : "derived",
  });
}

function jsonError(status: number, code: string) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
