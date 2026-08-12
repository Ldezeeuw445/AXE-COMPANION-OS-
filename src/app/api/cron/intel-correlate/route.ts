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
 * Keeps intel_correlations fresh automatically instead of only updating
 * when someone clicks the button on /intel. Found live: the last manual
 * correlation was 2026-07-15, three weeks stale. Same LLM analysis as the
 * button (src/lib/intel/correlationEngine.ts), same table, just triggered
 * on a schedule instead of on-demand.
 *
 * Not Vercel-Cron-driven — this app now runs as a packaged Tauri desktop
 * build with a local sidecar server, not a Vercel deployment. AXE Core (a
 * sibling Tauri app on the same Mac) polls this route on its own interval
 * instead, the same way it drives its own 24/7 trading loop while its
 * window is open. CORS-open since the real gate is the bearer secret and
 * this server only ever binds to 127.0.0.1.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 503, headers: CORS_HEADERS });

  const intel = await loadIntelSnapshot({});
  const context = buildIntelContext(intel);
  if (!context.trim()) {
    return Response.json({ ok: true, skipped: "no_intel_data" }, { headers: CORS_HEADERS });
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
    return Response.json({ ok: true, correlation, saved: !error }, { headers: CORS_HEADERS });
  } catch (e) {
    console.error("[cron/intel-correlate] Failed:", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500, headers: CORS_HEADERS });
  }
}
