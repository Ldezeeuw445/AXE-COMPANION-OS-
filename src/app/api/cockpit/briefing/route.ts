/**
 * GET  /api/cockpit/briefing  — fetch active brief (daily or unread weekly)
 * POST /api/cockpit/briefing  — generate on demand (Pro+)
 * POST /api/cockpit/briefing?read=true&date=YYYY-MM-DD&type=weekly — mark read
 */

import { NextRequest, after } from "next/server";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import {
  getActiveBrief,
  generateMorningBrief,
  markBriefRead,
  ensureTodaysDailyBrief,
  shouldDeliverTodaysDailyBrief,
} from "@/services/axeDailyBriefingService";
import { requireEntitlementFeature } from "@/lib/billing/requireFeature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const auth = await getAuthedServiceSupabase();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlementFeature(auth.supabase, auth.user.id, "briefings");
  if (!gate.ok) {
    return Response.json({ error: gate.error, brief: null, upgradeRequired: true }, { status: gate.status });
  }

  let brief = await getActiveBrief(auth.supabase, auth.user.id);

  if (!brief) {
    const { due } = await shouldDeliverTodaysDailyBrief(auth.supabase, auth.user.id);
    if (due) {
      after(async () => {
        try {
          await ensureTodaysDailyBrief(auth.user.id);
        } catch (err) {
          console.error("[Briefing API] background delivery failed:", err);
        }
      });
      return Response.json(
        {
          brief: null,
          delivering: true,
          message: "Generating your morning brief — check back in a moment",
        },
        { status: 200 },
      );
    }
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

    const { due } = await shouldDeliverTodaysDailyBrief(auth.supabase, auth.user.id);
    if (due) {
      try {
        await ensureTodaysDailyBrief(auth.user.id);
        const brief = await getActiveBrief(auth.supabase, auth.user.id);
        return Response.json({ brief, generated: true }, { status: 200 });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[Briefing API] auto-deliver failed:", msg);
        return Response.json({ error: msg }, { status: 500 });
      }
    }

    return Response.json(
      {
        brief: null,
        message: "No brief yet — delivered daily from 06:00 your local time",
      },
      { status: 200 },
    );
  }

  try {
    const result = await generateMorningBrief(auth.user.id, undefined, { force: true });
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
