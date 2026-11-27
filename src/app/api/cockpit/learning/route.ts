import { NextResponse } from "next/server";
import { tradingOsCors, userSupabaseFromRequest } from "@/lib/auth/tradingOsBearer";
import { getLearningModel, validateOverride } from "@/services/learningModelService";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AXE learning model v2 for the signed-in user: score components, what AXE
 * learned (and from which events), what it still does not know, 12-week
 * history, and the user's corrections. Cookie session (Companion) or Bearer
 * access token (Trading OS). RLS applies; never a service role.
 */
export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: tradingOsCors(request, "GET, POST, OPTIONS") });
}

export async function GET(request: Request) {
  const cors = tradingOsCors(request, "GET, POST, OPTIONS");
  const authed = await userSupabaseFromRequest(request);
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: cors });
  const gate = await requireEntitlementFeature(authed.supabase, authed.user.id, "cockpit_learning");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, upgradeRequired: true }, { status: gate.status, headers: cors });
  }
  const view = await getLearningModel(authed.supabase, authed.user.id);
  if (!view) {
    return NextResponse.json({ error: "trades_unavailable" }, { status: 503, headers: cors });
  }
  return NextResponse.json({ ok: true, ...view }, { headers: { ...cors, "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const cors = tradingOsCors(request, "GET, POST, OPTIONS");
  const authed = await userSupabaseFromRequest(request);
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: cors });
  const gate = await requireEntitlementFeature(authed.supabase, authed.user.id, "cockpit_learning");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, upgradeRequired: true }, { status: gate.status, headers: cors });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: cors });
  }
  const v = validateOverride(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: cors });

  const { supabase, user } = authed;
  if (v.action === "undo") {
    const { error } = await supabase
      .from("axe_learning_overrides")
      .delete()
      .eq("user_id", user.id)
      .eq("item_key", v.itemKey);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors });
  } else {
    const { error } = await supabase.from("axe_learning_overrides").insert({
      user_id: user.id,
      item_key: v.itemKey,
      action: v.action,
      value: v.action === "correct" ? v.value : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors });
  }
  const view = await getLearningModel(supabase, user.id);
  return NextResponse.json({ ok: true, ...(view ?? {}) }, { headers: { ...cors, "Cache-Control": "no-store" } });
}
