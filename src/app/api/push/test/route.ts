import { NextRequest, NextResponse } from "next/server";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";
import { vapidConfigStatus } from "@/lib/push/deliver";
import { runPushTestSuite } from "@/lib/push/runTestSuite";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/push/test  — signed-in diagnostics (VAPID, subscription count).
 * POST /api/push/test  — send one test of each category to the calling user.
 *
 * Self-send only: the signed-in user is the recipient. Settings also has
 * `sendPushTestSuiteAction` for the same suite.
 */

async function authedWriter() {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const gate = await requireEntitlementFeature(authed.supabase, authed.user.id, "push_notifications");
  if (!gate.ok) {
    return {
      error: NextResponse.json({ error: gate.error, upgradeRequired: true }, { status: gate.status }),
    };
  }
  const writer = createServiceRoleSupabaseClient() ?? authed.supabase;
  return { authed, writer };
}

export async function GET(): Promise<NextResponse> {
  const ready = await authedWriter();
  if ("error" in ready && ready.error) return ready.error;
  const { authed, writer } = ready as Exclude<Awaited<ReturnType<typeof authedWriter>>, { error: NextResponse }>;

  const vapid = vapidConfigStatus();
  const { count, error } = await writer
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", authed.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    vapidConfigured: vapid.ok,
    vapidMissing: vapid.missing,
    subscriptionCount: count ?? 0,
    userId: authed.user.id,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ready = await authedWriter();
  if ("error" in ready && ready.error) return ready.error;
  const { authed, writer } = ready as Exclude<Awaited<ReturnType<typeof authedWriter>>, { error: NextResponse }>;

  let types: unknown;
  try {
    const body = (await req.json()) as { types?: unknown };
    types = body.types;
  } catch {
    types = undefined;
  }

  const result = await runPushTestSuite(authed.user.id, writer, types);
  return NextResponse.json({
    ...result,
    vapid: vapidConfigStatus(),
  });
}
