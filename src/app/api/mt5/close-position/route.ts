import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { closePaperPositionById } from "@/services/paperOrderService";
import { rejectRequestedVolume } from "@/lib/trading/partialClose";
import { getMetaApiToken } from "@/lib/mt5/metaApiEnv";
import {
  clientClosePosition,
  MetaApiRequestError,
  type ClosePositionInput,
} from "@/lib/mt5/metaApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Close an open MT5 position.
 *
 * Guards (same layering as /api/mt5/order):
 *   1. Supabase auth
 *   2. Body validation — brokerAccountId + positionId required
 *   3. Account ownership
 *   4. Practice positions close here and return — nothing reaches a broker.
 *   5. MetaApi configured + cloud MT5 account required
 *
 * Closing / reducing risk is always allowed once auth + ownership hold.
 * The live-trading kill switch must never trap a trader in a position.
 */

type CloseBody = {
  brokerAccountId: string;
  positionId: string;
  /** Lots to close. Omit for the whole position. Build-list item 11. */
  volume?: number | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase)
    return errJson(503, "supabase_not_configured", "Supabase is not configured.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return errJson(401, "unauthorized", "Sign in to close positions.");



  let body: CloseBody;
  try {
    body = (await request.json()) as CloseBody;
  } catch {
    return errJson(400, "invalid_body", "Payload must be JSON.");
  }

  const { brokerAccountId, positionId, volume } = body ?? {};

  if (typeof brokerAccountId !== "string" || !brokerAccountId) {
    return errJson(400, "missing_account", "brokerAccountId is required.");
  }
  if (typeof positionId !== "string" || !positionId) {
    return errJson(400, "missing_position", "positionId is required.");
  }

  // Account ownership
  // A requested size is checked here for the things the server can know —
  // zero, off-step, under the broker minimum. Whether it fits this particular
  // position is MetaApi's answer for a live account, and ours for a practice
  // one, because there we hold the volume.
  if (volume != null) {
    const bad = rejectRequestedVolume(Number(volume));
    if (bad) return errJson(400, "invalid_volume", bad);
  }

  const { data: account, error: accountErr } = await supabase
    .from("user_broker_accounts")
    .select(
      "id,user_id,connection_method,external_connection_id,provider,metadata",
    )
    .eq("id", brokerAccountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountErr)
    return errJson(500, "account_lookup_failed", accountErr.message);
  if (!account)
    return errJson(
      404,
      "account_not_found",
      "That broker account is not on your workspace.",
    );

  // Practice position: closed here, against a price of the kind it opened on.
  // This used to be a 409, which was true of a *live* position and wrong
  // about the only kind this account has. Build-list item 10.
  if (
    account.connection_method === "demo_paper" ||
    account.provider === "demo"
  ) {
    const result = await closePaperPositionById(supabase, user.id, positionId, volume ?? null);
    if (!result.ok) {
      const status = result.code === "position_not_found" ? 404 : 400;
      return errJson(status, result.code, result.message);
    }
    return Response.json({ ...result, paper: true });
  }

  // Everything below closes a real position and needs the provider for it.
  if (!getMetaApiToken()) {
    return errJson(
      503,
      "provider_not_configured",
      "MetaApi token is not configured on this server.",
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

  // Resolve MetaApi region
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

  const input: ClosePositionInput = {
    accountId: account.external_connection_id,
    positionId,
    region: accountRegion,
    volume: volume ?? null,
  };

  try {
    const result = await clientClosePosition(input);
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
