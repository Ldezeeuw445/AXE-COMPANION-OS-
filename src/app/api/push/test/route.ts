import { NextRequest, NextResponse } from "next/server";
import { hasCronSecret } from "@/lib/auth/cronSecret";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";
import { runPushTestSuite } from "@/lib/push/runTestSuite";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

/**
 * POST /api/push/test
 *
 * Sends one test push of each C6 category to the calling signed-in user.
 * Protected with `Authorization: Bearer <CRON_SECRET>` so this cannot be
 * used as a public notification cannon. Settings uses a server action
 * (`sendPushTestSuiteAction`) for the same suite without exposing the secret.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasCronSecret(req.headers)) {
    return NextResponse.json({ error: "CRON_SECRET required" }, { status: 401 });
  }

  const authed = await getAuthedServiceSupabase();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, user } = authed;
  const gate = await requireEntitlementFeature(supabase, user.id, "push_notifications");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, upgradeRequired: true }, { status: gate.status });
  }

  let types: unknown;
  try {
    const body = (await req.json()) as { types?: unknown };
    types = body.types;
  } catch {
    types = undefined;
  }

  const result = await runPushTestSuite(user.id, supabase, types);
  return NextResponse.json(result);
}
