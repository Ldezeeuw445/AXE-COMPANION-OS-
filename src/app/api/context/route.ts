/**
 * GET /api/context?symbol=XAUUSD&tf=15m
 *
 * Returns the central TradingOS context for AXE — the same data that
 * /api/ai/desk and chatService use internally, exposed as a JSON endpoint
 * so the UI or other consumers can read the assembled context.
 *
 * Query params:
 *   symbol  — trading instrument (optional), e.g. XAUUSD, EURUSD, ES
 *   tf      — timeframe (optional), e.g. 5m, 15m, 1h, 4h, D
 *   q       — optional text for knowledge-layer retrieval preview
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";
import { fetchTradingOSContext } from "@/services/contextService";
import { buildAxeKnowledgeLayerBlock } from "@/lib/axe/knowledgeLayerContext";

export async function GET(request: NextRequest) {
  const authed = await getAuthedServiceSupabase();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? undefined;
  const tf = searchParams.get("tf") ?? undefined;
  const q = searchParams.get("q") ?? "";

  const [context, knowledgeLayer] = await Promise.all([
    fetchTradingOSContext(authed.user.id, authed.supabase, symbol, tf),
    buildAxeKnowledgeLayerBlock(
      authed.supabase,
      authed.user.id,
      q || "trading context",
      symbol ?? null,
    ),
  ]);

  return NextResponse.json({ ...context, knowledge_layer: knowledgeLayer });
}
