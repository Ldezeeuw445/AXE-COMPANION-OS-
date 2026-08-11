import { createEdgeSupabaseClient } from "@/lib/supabase/edge";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { buildIntelContext, runCorrelationAnalysis, getFeedCounts } from "@/lib/intel/correlationEngine";

export const dynamic = "force-dynamic";

/**
 * POST /api/intel-correlate
 *
 * Runs LLM cross-feed correlation analysis on the current intel snapshot.
 * Takes all 10 feeds (smart money + alt-data), builds a structured context,
 * and asks the LLM to find actionable cross-feed correlations.
 *
 * Body: { symbol?: string }
 * Returns: { ok: true, correlation: {...} } | { ok: false, error: string }
 *
 * The actual analysis logic (buildIntelContext/runCorrelationAnalysis/
 * getFeedCounts) lives in src/lib/intel/correlationEngine.ts, shared with
 * the scheduled src/app/api/cron/intel-correlate route — this button stays
 * the on-demand, user-triggered path; the cron keeps intel_correlations
 * fresh automatically instead of only on a click.
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const supabase = createEdgeSupabaseClient(request);
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  let body: { symbol?: string } = {};
  try {
    body = (await request.json()) as { symbol?: string };
  } catch {
    /* empty body is fine */
  }

  const symbol = body.symbol?.trim().toUpperCase() || undefined;

  // Load the full intel snapshot (all 10 feeds)
  const intel = await loadIntelSnapshot({ symbol });

  // Build structured context for LLM
  const context = buildIntelContext(intel, symbol);

  if (!context.trim()) {
    return jsonResponse({ ok: false, error: "No intel data available for correlation analysis" }, 400);
  }

  try {
    const correlation = await runCorrelationAnalysis(context, symbol);

    // Save to Supabase
    try {
      await supabase.from("intel_correlations").insert({
        user_id: user.id,
        title: correlation.title,
        summary: correlation.summary,
        confidence: correlation.confidence,
        signal: correlation.signal,
        feeds_used: correlation.feedsUsed,
        symbols: correlation.symbols,
        data_points: { feedCounts: getFeedCounts(intel) },
        raw_context: context.slice(0, 5000),
      });
    } catch {
      /* best effort — correlation still returned to user */
    }

    return jsonResponse({ ok: true, correlation });
  } catch (e) {
    console.error("[intel-correlate] Failed:", e);
    return jsonResponse(
      { ok: false, error: "AXE couldn't analyze correlations right now — please try again in a moment." },
      503,
    );
  }
}
