import { NextRequest, NextResponse } from "next/server";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";
import { canAccessBeta } from "@/lib/beta/flags";
import { normalizeAxePlan } from "@/lib/billing/features";
import { getUserAxeEntitlement } from "@/services/billingService";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";

export async function POST(req: NextRequest) {
  const authed = await getAuthedServiceSupabase();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, user } = authed;
  const gate = await requireEntitlementFeature(supabase, user.id, "push_notifications");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, upgradeRequired: true }, { status: gate.status });
  }

  const ent = await getUserAxeEntitlement(supabase, user.id);
  if (!canAccessBeta("push_alerts", normalizeAxePlan(ent.plan))) {
    return NextResponse.json(
      { error: "Push alerts beta is not on for your plan.", upgradeRequired: true, beta: "push_alerts" },
      { status: 403 },
    );
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Missing subscription fields" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") ?? null;
  const writer = createServiceRoleSupabaseClient() ?? supabase;

  const { error } = await writer.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: userAgent,
    },
    { onConflict: "user_id,endpoint" }
  );

  if (error) {
    console.error("[push/subscribe] upsert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const authed = await getAuthedServiceSupabase();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, user } = authed;
  const gate = await requireEntitlementFeature(supabase, user.id, "push_notifications");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, upgradeRequired: true }, { status: gate.status });
  }

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { endpoint } = body;
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const writer = createServiceRoleSupabaseClient() ?? supabase;
  await writer
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
