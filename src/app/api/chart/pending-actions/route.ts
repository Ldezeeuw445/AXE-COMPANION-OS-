import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  consumePendingChartAction,
  listPendingChartActions,
} from "@/services/chartActionQueueService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ actions: [] });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const symbol = request.nextUrl.searchParams.get("symbol") ?? undefined;
  const timeframe = request.nextUrl.searchParams.get("tf") ?? undefined;
  const actions = await listPendingChartActions(supabase, user.id, symbol, timeframe);
  return Response.json({ actions });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "unauthorized" }, { status: 401 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as { id?: string };
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  await consumePendingChartAction(supabase, user.id, body.id);
  return Response.json({ ok: true });
}
