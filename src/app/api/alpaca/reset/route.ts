import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resetAlpacaPaperTrading } from "@/lib/alpaca/reset";
import { isAlpacaConfigured } from "@/lib/alpaca/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResetBody = {
  brokerAccountId: string;
};

/**
 * POST /api/alpaca/reset
 *
 * Cancels all open Alpaca paper orders and closes all positions for the
 * platform paper account. Scoped to the user's linked cloud_alpaca row.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return Response.json({ ok: false, code: "supabase_not_configured", message: "Supabase not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, code: "unauthorized", message: "Sign in to reset Alpaca paper." }, { status: 401 });
  }

  if (!isAlpacaConfigured()) {
    return Response.json(
      { ok: false, code: "alpaca_not_configured", message: "Alpaca paper is not configured." },
      { status: 503 },
    );
  }

  let body: ResetBody;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    return Response.json({ ok: false, code: "invalid_body", message: "Payload must be JSON." }, { status: 400 });
  }

  const brokerAccountId = body?.brokerAccountId?.trim();
  if (!brokerAccountId) {
    return Response.json({ ok: false, code: "missing_account", message: "brokerAccountId is required." }, { status: 400 });
  }

  const { data: account, error } = await supabase
    .from("user_broker_accounts")
    .select("id,connection_method")
    .eq("id", brokerAccountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return Response.json({ ok: false, code: "lookup_failed", message: error.message }, { status: 500 });
  }
  if (!account || account.connection_method !== "cloud_alpaca") {
    return Response.json({ ok: false, code: "not_alpaca", message: "That account is not an Alpaca paper account." }, { status: 404 });
  }

  const result = await resetAlpacaPaperTrading(supabase, user.id, brokerAccountId);
  if (!result.ok) {
    return Response.json({ ok: false, code: result.code, message: result.message }, { status: 422 });
  }

  return Response.json({ ok: true, message: result.message });
}
