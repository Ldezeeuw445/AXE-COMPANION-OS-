import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isUuid, normalizeSymbol, normalizeTimeframe } from "@/lib/chart/drawingsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Durable chart drawings for the signed-in user.
 *
 * Drawings are not a paid feature (basic charting is on Free). The route is
 * classified in FREE_ROUTE_REASONS; if a drawing cap is added to
 * `AxeFeature`, gate it here with requireEntitlementFeature.
 */

const GET_LIMIT = 2000;
const PUT_LIMIT = 200;

type IncomingDrawing = {
  id?: unknown;
  symbol?: unknown;
  timeframe?: unknown;
  toolType?: unknown;
  drawing?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  deleted?: unknown;
};

type ChartDrawingRow = {
  id: string;
  user_id: string;
  symbol: string;
  timeframe: string | null;
  drawing: Record<string, unknown>;
  tool_type: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
};

function jsonError(status: number, code: string) {
  return Response.json({ error: code }, { status });
}

function asIso(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function rowToClient(row: ChartDrawingRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    toolType: row.tool_type,
    drawing: row.drawing,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted,
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  const symbolParam = request.nextUrl.searchParams.get("symbol");
  const timeframeParam = request.nextUrl.searchParams.get("timeframe");
  const symbol = symbolParam ? normalizeSymbol(symbolParam) : null;
  const timeframe = timeframeParam != null ? normalizeTimeframe(timeframeParam) : undefined;

  let query = supabase
    .from("chart_drawings")
    .select("id,user_id,symbol,timeframe,drawing,tool_type,created_at,updated_at,deleted")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(GET_LIMIT);

  if (symbol) query = query.eq("symbol", symbol);
  if (timeframe !== undefined) {
    if (timeframe == null) query = query.is("timeframe", null);
    else query = query.eq("timeframe", timeframe);
  }

  const { data, error } = await query;
  if (error) return jsonError(500, error.message);

  return Response.json({ drawings: ((data ?? []) as ChartDrawingRow[]).map(rowToClient) });
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonError(503, "supabase_not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthorized");

  let body: { drawings?: IncomingDrawing[] };
  try {
    body = (await request.json()) as { drawings?: IncomingDrawing[] };
  } catch {
    return jsonError(400, "invalid_json");
  }

  const incoming = Array.isArray(body.drawings) ? body.drawings : null;
  if (!incoming) return jsonError(400, "invalid_drawings");
  if (incoming.length > PUT_LIMIT) return jsonError(400, "too_many_drawings");
  if (incoming.length === 0) return Response.json({ ok: true, upserted: 0 });

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const item of incoming) {
    if (typeof item.id !== "string" || !isUuid(item.id)) {
      return jsonError(400, "invalid_id");
    }
    if (typeof item.symbol !== "string" || !normalizeSymbol(item.symbol)) {
      return jsonError(400, "invalid_symbol");
    }
    if (typeof item.toolType !== "string" || !item.toolType.trim()) {
      return jsonError(400, "invalid_tool_type");
    }
    const createdAt = asIso(item.createdAt, now);
    const updatedAt = asIso(item.updatedAt, now);
    rows.push({
      id: item.id,
      user_id: user.id,
      symbol: normalizeSymbol(item.symbol),
      timeframe: normalizeTimeframe(typeof item.timeframe === "string" ? item.timeframe : null),
      drawing: asObject(item.drawing),
      tool_type: item.toolType.trim(),
      created_at: createdAt,
      updated_at: updatedAt,
      deleted: item.deleted === true,
    });
  }

  const { error } = await supabase.from("chart_drawings").upsert(rows, { onConflict: "id" });
  if (error) return jsonError(500, error.message);

  return Response.json({ ok: true, upserted: rows.length });
}
