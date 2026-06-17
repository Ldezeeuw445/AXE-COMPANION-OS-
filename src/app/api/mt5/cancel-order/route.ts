import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientCancelOrder,
  MetaApiRequestError,
  type CancelOrderInput,
} from "@/lib/mt5/metaApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CancelBody = {
  brokerAccountId: string;
  orderId: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return errJson(503, "supabase_not_configured", "Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errJson(401, "unauthorized", "Sign in to cancel orders.");

  if (!getMetaApiToken()) {
    return errJson(
      503,
      "provider_not_configured",
      "MetaApi token is not configured on this server.",
    );
  }

  let body: CancelBody;
  try {
    body = (await request.json()) as CancelBody;
  } catch {
    return errJson(400, "invalid_body", "Payload must be JSON.");
  }

  const { brokerAccountId, orderId } = body ?? {};
  if (typeof brokerAccountId !== "string" || !brokerAccountId) {
    return errJson(400, "missing_account", "brokerAccountId is required.");
  }
  if (typeof orderId !== "string" || !orderId) {
    return errJson(400, "missing_order", "orderId is required.");
  }

  const { data: account, error: accountErr } = await supabase
    .from("user_broker_accounts")
    .select(
      "id,user_id,connection_method,external_connection_id,provider,metadata",
    )
    .eq("id", brokerAccountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountErr) return errJson(500, "account_lookup_failed", accountErr.message);
  if (!account) {
    return errJson(
      404,
      "account_not_found",
      "That broker account is not on your workspace.",
    );
  }

  if (
    account.connection_method === "demo_paper" ||
    account.provider === "demo"
  ) {
    return errJson(
      409,
      "demo_account",
      "Demo accounts cannot cancel live orders.",
    );
  }

  if (
    account.connection_method !== "cloud_mt5" ||
    !account.external_connection_id
  ) {
    return errJson(
      409,
      "account_not_connected",
      "Account is not linked to MetaApi.",
    );
  }

  const { data: prefs, error: prefsErr } = await supabase
    .from("user_workspace_preferences")
    .select("live_trading_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (prefsErr) return errJson(500, "prefs_lookup_failed", prefsErr.message);
  if (!prefs?.live_trading_enabled) {
    return errJson(
      403,
      "live_trading_disabled",
      "Live trading is not enabled for this workspace.",
    );
  }

  const accountMeta =
    account.metadata &&
    typeof account.metadata === "object" &&
    !Array.isArray(account.metadata)
      ? (account.metadata as Record<string, unknown>)
      : {};
  const accountRegion =
    typeof accountMeta.metaapiRegion === "string"
      ? accountMeta.metaapiRegion
      : null;

  const input: CancelOrderInput = {
    accountId: account.external_connection_id,
    orderId,
    region: accountRegion,
  };

  try {
    const result = await clientCancelOrder(input);
    const ok =
      result.stringCode === "TRADE_RETCODE_DONE" ||
      result.stringCode === "TRADE_RETCODE_DONE_PARTIAL" ||
      result.stringCode === "TRADE_RETCODE_PLACED";

    return Response.json(
      {
        ok,
        stringCode: result.stringCode ?? null,
        numericCode: result.numericCode ?? null,
        message: result.message ?? null,
        raw: result.raw,
      },
      { status: ok ? 200 : 422 },
    );
  } catch (e) {
    if (e instanceof MetaApiRequestError) {
      return errJson(502, e.code, e.message, { payload: e.payload });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return errJson(500, "unknown", message);
  }
}

function errJson(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return Response.json({ ok: false, code, message, ...extra }, { status });
}
