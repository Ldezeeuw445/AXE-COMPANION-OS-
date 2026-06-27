/**
 * GET  /api/cockpit/briefing  — fetch active brief (daily or unread weekly)
 * POST /api/cockpit/briefing  — generate on demand (Pro+)
 * POST /api/cockpit/briefing?read=true&date=YYYY-MM-DD&type=weekly — mark read
 */

import { NextRequest } from "next/server";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import {
  getActiveBrief,
  generateMorningBrief,
  markBriefRead,
} from "@/services/axeDailyBriefingService";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthedServiceSupabase();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlementFeature(auth.supabase, auth.user.id, "briefings");
  if (!gate.ok) {
    return Response.json({ error: gate.error, brief: null, upgradeRequired: true }, { status: gate.status });
  }

  const brief = await getActiveBrief(auth.supabase, auth.user.id);

  if (!brief) {
    return Response.json({ brief: null, message: "No brief for today yet" }, { status: 200 });
  }

  return Response.json({ brief }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedServiceSupabase();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const markRead = url.searchParams.get("read") === "true";
  if (markRead) {
    const date = url.searchParams.get("date");
    const type = url.searchParams.get("type") === "weekly" ? "weekly" : "daily";
    if (!date) {
      return Response.json({ error: "date required" }, { status: 400 });
    }
    await markBriefRead(auth.supabase, auth.user.id, date, type);
    return Response.json({ ok: true });
  }

  const gate = await requireEntitlementFeature(auth.supabase, auth.user.id, "briefings");
  if (!gate.ok) {
    return Response.json({ error: gate.error, upgradeRequired: true }, { status: gate.status });
  }

  const force = url.searchParams.get("force") === "true";

  if (!force) {
    const existing = await getActiveBrief(auth.supabase, auth.user.id);
    if (existing) {
      return Response.json({ brief: existing, cached: true }, { status: 200 });
    }
  }

  try {
    const result = await generateMorningBrief(auth.user.id, auth.supabase);
    const brief = await getActiveBrief(auth.supabase, auth.user.id);

    return Response.json({
      brief,
      model: result.model,
      provider: result.provider,
      latency_ms: result.latency_ms,
      generated: true,
    }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Briefing API] generate failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
