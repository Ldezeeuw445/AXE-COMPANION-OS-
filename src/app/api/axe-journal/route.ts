import { createServerSupabaseClient } from "@/lib/supabase/server";
import { autoJournalTrades } from "@/services/journalingService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/axe-journal — Auto-journal trades with alignment scoring.
 *   Body: { accountId: string, tradeIds?: string[] }
 *   If tradeIds omitted, journals all un-journaled trades for that account.
 *
 *   For each trade, AXE analyzes:
 *   - Did it follow playbook rules?
 *   - Did it respect risk rules?
 *   - Did it avoid known weaknesses?
 *   - Did it leverage known strengths?
 *
 *   Produces: axe_label, axe_note, alignment_score (0-100), axe_journal (full breakdown)
 *
 * GET /api/axe-journal?accountId=xxx — Get alignment overview for recent trades
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* ── GET: alignment overview ─────────────────────────────────────── */

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  if (!accountId) return jsonResponse({ ok: false, error: "missing accountId" }, 400);

  // Get trades with their journal labels
  const { data: trades } = await supabase
    .from("broker_trades")
    .select("id,symbol,side,pnl,close_time")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .not("close_time", "is", null)
    .order("close_time", { ascending: false })
    .limit(30);

  if (!trades?.length) return jsonResponse({ ok: true, trades: [] });

  const tradeIds = trades.map((t: { id: string }) => t.id);
  const { data: labels } = await supabase
    .from("trade_journal_labels")
    .select("trade_id,label,note,axe_label,axe_note,alignment_score,axe_journal")
    .eq("user_id", user.id)
    .in("trade_id", tradeIds);

  const labelMap = new Map<string, Record<string, unknown>>();
  for (const l of labels ?? []) {
    const row = l as Record<string, unknown>;
    labelMap.set(row.trade_id as string, row);
  }

  const result = trades.map((t: Record<string, unknown>) => {
    const lab = labelMap.get(t.id as string);
    return {
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      pnl: t.pnl,
      close_time: t.close_time,
      user_label: lab ? (lab.label ?? null) : null,
      user_note: lab ? (lab.note ?? null) : null,
      axe_label: lab ? (lab.axe_label ?? null) : null,
      axe_note: lab ? (lab.axe_note ?? null) : null,
      alignment_score: lab ? (lab.alignment_score ?? null) : null,
      axe_journal: lab ? (lab.axe_journal ?? null) : null,
    };
  });

  return jsonResponse({ ok: true, trades: result });
}

/* ── POST: auto-journal trades ───────────────────────────────────── */

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return jsonResponse({ ok: false, error: "supabase_not_configured" }, 503);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as {
    accountId?: string;
    tradeIds?: string[];
  } | null;

  const accountId = body?.accountId;
  if (!accountId) return jsonResponse({ ok: false, error: "missing accountId" }, 400);

  const result = await autoJournalTrades(supabase, user.id, accountId, body?.tradeIds);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status);
  return jsonResponse(result);
}
