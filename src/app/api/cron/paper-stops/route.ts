import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { sweepPaperStops } from "@/services/paperStopWatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Host cron — close practice positions whose stop or target has been reached.
 *
 * Secured with CRON_SECRET, like the other sweeps
 * (`scripts/run-vps-cron.sh` sends Authorization: Bearer <CRON_SECRET>).
 *
 * No MetaApi token needed: practice fills are priced from
 * `chart_live_snapshots` or from the demo generator, never from the broker.
 * Requiring a token here would stop practice stops firing on a host that has
 * no broker configured, which is exactly where someone is most likely to be
 * practising.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return Response.json({ error: "supabase_service_role_missing" }, { status: 503 });
  }

  const summary = await sweepPaperStops(supabase, { maxPositions: 200 });

  // Errors are reported rather than thrown: one unreadable position must not
  // stop the sweep for everyone else, and a run that closed nothing because
  // every price was stale should look different from one that found nothing
  // to do. `skipped` carries that difference.
  return Response.json({ ok: true, ...summary });
}
