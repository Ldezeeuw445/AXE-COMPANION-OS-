import type { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { runUserKnowledgeBatch } from "@/services/userKnowledgeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled from pg_cron (see docs/CRON-RUNBOOK.md) — distils each trader's own
 * trades, corrections and notes into user-scoped RAG documents, so AXE and AXE
 * Intel retrieve something about *them* and not only the shipped seed docs.
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

  const summary = await runUserKnowledgeBatch(supabase, { maxUsers: 25 });
  return Response.json({ ok: true, ...summary });
}
