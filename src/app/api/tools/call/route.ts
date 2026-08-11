import type { NextRequest } from "next/server";
import { loadIntelSnapshot } from "@/lib/intel/intelClient";
import { fetchEconomicCalendar } from "@/services/marketDataService";
import { loadNews } from "@/lib/market/newsProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/tools/call — external, service-to-service tool calling.
 *
 * AXE Core (a sibling app, same Supabase project) asked to reuse
 * Companion's "tool calling" — Companion's actual tool-calling
 * (src/services/axeService.ts's AXE_TOOLS, 18 tools) is real but lives
 * inside streamChatMessage's closure in chatService.ts, tightly coupled to
 * a specific user's chat session, broker context and cookies. Duplicating
 * that here would drift over time; routing AXE Core through a full chat
 * turn just to call one tool would mean an extra LLM round-trip for no
 * reason.
 *
 * Instead this exposes the 3 underlying data functions that are already
 * genuinely global/shared (not tied to any one user's session or broker
 * state) directly: smart-money intel, economic calendar, market news.
 * Deliberately NOT exposed: get_live_price (wraps fetchTradingOSContext,
 * which pulls a signed-in user's own broker/position context — AXE Core
 * already has its own live price feed via MetaAPI/TwelveData and doesn't
 * need this), the calculate_ and analyze_ chart-math tools (AXE Core has
 * its own indicator math), and every tool that writes data on behalf of a
 * specific Companion user (create_alert, track_commitment, update_alert,
 * save_note, prepare_execution_request, etc.) — an external caller has no
 * business mutating another app's per-user state.
 *
 * Auth: shared secret, same pattern as the CRON_SECRET-gated cron routes
 * (see src/app/api/cron/intel-warmup/route.ts) but its own env var so this
 * surface can be rotated/revoked independently of Vercel Cron.
 */

const TOOLS = {
  get_smart_money_intel: async (args: Record<string, unknown>) => {
    const symbol = typeof args.symbol === "string" ? args.symbol.toUpperCase().trim() || undefined : undefined;
    return loadIntelSnapshot({ symbol });
  },
  get_economic_calendar: async (args: Record<string, unknown>) => {
    const currency = typeof args.currency === "string" ? args.currency : undefined;
    const impact = args.impact === "High" || args.impact === "Medium" || args.impact === "Low" ? args.impact : undefined;
    return fetchEconomicCalendar(currency, impact);
  },
  get_news_headlines: async (args: Record<string, unknown>) => {
    const symbol = typeof args.symbol === "string" ? args.symbol.toUpperCase().trim() : "";
    if (!symbol) throw new Error("symbol is required");
    const limit = Math.max(1, Math.min(20, Number(args.limit ?? 8)));
    return loadNews({ symbol, watchlist: [], limit });
  },
} as const;

type ToolName = keyof typeof TOOLS;

export async function POST(request: NextRequest) {
  const secret = process.env.AXE_CORE_TOOLS_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { tool?: string; args?: Record<string, unknown> } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }

  const tool = body.tool as ToolName | undefined;
  if (!tool || !(tool in TOOLS)) {
    return Response.json(
      { ok: false, error: `unknown tool '${body.tool}' — available: ${Object.keys(TOOLS).join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const data = await TOOLS[tool](body.args ?? {});
    return Response.json({ ok: true, tool, data });
  } catch (e) {
    console.error(`[tools/call] ${tool} failed:`, e);
    return Response.json({ ok: false, tool, error: e instanceof Error ? e.message : "unknown error" }, { status: 502 });
  }
}
