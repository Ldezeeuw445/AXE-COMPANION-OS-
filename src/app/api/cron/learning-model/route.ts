import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { runLearningModelBatch } from "@/services/learningModelBatchService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Learning model v2 snapshots for entitled users. Also runs inside the daily
 * cockpit-snapshots job, so it needs no new schedule; this route exists for
 * a manual or extra run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) return Response.json({ error: "supabase_service_role_missing" }, { status: 503 });
  const summary = await runLearningModelBatch(supabase, { maxUsers: 60 });
  return Response.json({ ok: true, ...summary });
}
