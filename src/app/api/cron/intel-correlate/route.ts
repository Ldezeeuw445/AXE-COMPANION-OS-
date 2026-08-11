import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { buildIntelContext, runCorrelationAnalysis, getFeedCounts } from "@/lib/intel/correlationEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// intel_correlations.user_id has no FK to auth.users, but every real row
// (184/196 historically) was tagged with this account — the app is
// effectively single-tenant, and there's no "current user" for a cron run
// the way the button route has one from the session cookie.
const AXE_OWNER_USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069";

/**
 * Vercel Cron — keeps intel_correlations fresh automatically instead of
 * only updating when someone clicks the button on /intel. Found live: the
 * last manual correlation was 2026-07-15, three weeks stale. Same LLM
 * analysis as the button (src/lib/intel/correlationEngine.ts), same
 * table, just scheduled instead of on-demand.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const intel = await loadIntelSnapshot({});
  const context = buildIntelContext(intel);
  if (!context.trim()) {
    return Response.json({ ok: true, skipped: "no_intel_data" });
  }

  try {
    const correlation = await runCorrelationAnalysis(context);
    const { error } = await supabase.from("intel_correlations").insert({
      user_id: AXE_OWNER_USER_ID,
      title: correlation.title,
      summary: correlation.summary,
      confidence: correlation.confidence,
      signal: correlation.signal,
      feeds_used: correlation.feedsUsed,
      symbols: correlation.symbols,
      data_points: { feedCounts: getFeedCounts(intel) },
      raw_context: context.slice(0, 5000),
    });
    if (error) console.error("[cron/intel-correlate] insert failed:", error.message);
    return Response.json({ ok: true, correlation, saved: !error });
  } catch (e) {
    console.error("[cron/intel-correlate] Failed:", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
