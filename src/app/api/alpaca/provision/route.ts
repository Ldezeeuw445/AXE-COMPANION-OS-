import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureAlpacaPaperAccount } from "@/lib/alpaca/provision";
import { isAlpacaConfigured } from "@/lib/alpaca/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/alpaca/provision
 *
 * Creates (or refreshes) an AXE-managed Alpaca paper broker account for the
 * signed-in user. No user credentials required — uses server env keys.
 */
export async function POST(_request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return Response.json({ ok: false, code: "supabase_not_configured", message: "Supabase not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, code: "unauthorized", message: "Sign in to enable Alpaca paper." }, { status: 401 });
  }

  if (!isAlpacaConfigured()) {
    return Response.json(
      {
        ok: false,
        code: "alpaca_not_configured",
        message: "Alpaca paper API keys are not configured on this deployment.",
      },
      { status: 503 },
    );
  }

  const result = await ensureAlpacaPaperAccount(supabase, user.id);
  if (!result.ok) {
    return Response.json({ ok: false, code: result.code, message: result.message }, { status: 422 });
  }

  return Response.json({
    ok: true,
    accountId: result.accountId,
    created: result.created,
    message: result.created ? "Alpaca paper account ready." : "Alpaca paper account refreshed.",
  });
}

export async function GET() {
  return Response.json({
    ok: true,
    configured: isAlpacaConfigured(),
    endpoint: "POST /api/alpaca/provision",
  });
}
