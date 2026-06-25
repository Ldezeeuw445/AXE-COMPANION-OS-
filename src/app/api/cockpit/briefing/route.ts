/**
 * GET  /api/cockpit/briefing  — fetch today's morning brief for the authed user
 * POST /api/cockpit/briefing  — generate (or regenerate) today's brief on demand
 */

import { NextRequest } from "next/server";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { getTodaysBrief, generateMorningBrief } from "@/services/axeDailyBriefingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthedServiceSupabase();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brief = await getTodaysBrief(auth.supabase, auth.user.id);

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

  // Optional: allow forcing a regenerate via ?force=true
  const force = new URL(request.url).searchParams.get("force") === "true";

  if (!force) {
    // Check if brief already exists for today
    const existing = await getTodaysBrief(auth.supabase, auth.user.id);
    if (existing) {
      return Response.json({ brief: existing, cached: true }, { status: 200 });
    }
  }

  try {
    const result = await generateMorningBrief(auth.user.id, auth.supabase);
    const brief = await getTodaysBrief(auth.supabase, auth.user.id);

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
