import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { runAxeProactiveWatcher } from "@/services/axeProactiveWatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Vercel Cron — AXE proactive watcher (trade closes, pending approvals, news risk).
 * Secured with CRON_SECRET.
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

  const summary = await runAxeProactiveWatcher(supabase, { maxUsers: 30 });
  return Response.json({ ok: true, ...summary });
}
