import { createServerSupabaseClient } from "@/lib/supabase/server";

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

type BrokerTrade = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  open_time: string | null;
  close_time: string | null;
  open_price: number | null;
  close_price: number | null;
  pnl: number;
  fees: number;
};

type JournalResult = {
  axe_label: string;
  axe_note: string;
  alignment_score: number;
  breakdown: {
    rule_adherence: number;
    playbook_alignment: number;
    risk_management: number;
    emotional_discipline: number;
    explanation: string;
  };
};

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

  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  if (!openaiKey) return jsonResponse({ ok: false, error: "OPENAI_API_KEY not configured" }, 503);

  // Fetch trades to journal
  let tradeQuery = supabase
    .from("broker_trades")
    .select("id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .not("close_time", "is", null)
    .order("close_time", { ascending: false });

  if (body?.tradeIds?.length) {
    tradeQuery = tradeQuery.in("id", body.tradeIds);
  } else {
    // Only un-journaled trades (no axe_label yet)
    const { data: labeled } = await supabase
      .from("trade_journal_labels")
      .select("trade_id")
      .eq("user_id", user.id)
      .not("axe_label", "is", null);

    const labeledIds = (labeled ?? []).map((l: { trade_id: string }) => l.trade_id);

    tradeQuery = tradeQuery.limit(20);

    // We'll filter in code to avoid complex NOT IN queries
    const { data: allTrades, error: tErr } = await tradeQuery;
    if (tErr) return jsonResponse({ ok: false, error: tErr.message }, 500);

    const trades = (allTrades ?? []).filter(
      (t: { id: string }) => !labeledIds.includes(t.id),
    ) as BrokerTrade[];

    if (trades.length === 0) {
      return jsonResponse({ ok: true, journaled: 0, message: "All recent trades already journaled" });
    }

    return await journalTrades(supabase, user.id, accountId, trades, openaiKey);
  }

  const { data: trades, error: tErr } = await tradeQuery;
  if (tErr) return jsonResponse({ ok: false, error: tErr.message }, 500);
  if (!trades?.length) return jsonResponse({ ok: true, journaled: 0 });

  return await journalTrades(supabase, user.id, accountId, trades as BrokerTrade[], openaiKey);
}

/* ── Core journaling logic ───────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function journalTrades(
  supabase: any,
  userId: string,
  accountId: string,
  trades: BrokerTrade[],
  openaiKey: string,
): Promise<Response> {
  // Load the trader's brain context: playbooks, rules, memories
  const [playbooks, rules, memories] = await Promise.all([
    loadPlaybooks(supabase, userId),
    loadRules(supabase, userId),
    loadMemories(supabase, userId),
  ]);

  let journaled = 0;
  const results: Array<{ tradeId: string; symbol: string; alignment_score: number; axe_label: string }> = [];

  // Process in batches of 5 for efficiency
  const batchSize = 5;
  for (let i = 0; i < trades.length; i += batchSize) {
    const batch = trades.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((trade) =>
        analyzeTradeAlignment(openaiKey, trade, playbooks, rules, memories).catch((e) => {
          console.error(`[axe-journal] Failed to analyze trade ${trade.id}:`, e);
          return null;
        }),
      ),
    );

    for (let j = 0; j < batch.length; j++) {
      const trade = batch[j];
      const result = batchResults[j];
      if (!result) continue;

      // Upsert the journal label
      const { data: existing } = await supabase
        .from("trade_journal_labels")
        .select("trade_id")
        .eq("user_id", userId)
        .eq("trade_id", trade.id)
        .maybeSingle();

      const payload = {
        axe_label: result.axe_label,
        axe_note: result.axe_note,
        alignment_score: result.alignment_score,
        axe_journal: result.breakdown,
      };

      if (existing?.trade_id) {
        await supabase
          .from("trade_journal_labels")
          .update(payload)
          .eq("user_id", userId)
          .eq("trade_id", trade.id);
      } else {
        await supabase.from("trade_journal_labels").insert({
          user_id: userId,
          trade_id: trade.id,
          account_id: accountId,
          ...payload,
        });
      }

      journaled++;
      results.push({
        tradeId: trade.id,
        symbol: trade.symbol,
        alignment_score: result.alignment_score,
        axe_label: result.axe_label,
      });
    }
  }

  return jsonResponse({ ok: true, journaled, results });
}

/* ── Load trader context ─────────────────────────────────────────── */

async function loadPlaybooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("axe_strategy_playbooks")
    .select("name,symbol,timeframe,rules,invalidation,checklist")
    .eq("active", true)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(6);

  if (!data?.length) return "No playbooks configured.";

  return (data as Record<string, unknown>[])
    .map(
      (p) =>
        `— ${p.name}${p.symbol ? ` (${p.symbol})` : ""} ${p.timeframe ? `[${p.timeframe}]` : ""}\n  Rules: ${p.rules}\n  Invalidation: ${p.invalidation}\n  Checklist: ${p.checklist}`,
    )
    .join("\n\n");
}

async function loadRules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("axe_user_rules")
    .select("rule_type,severity,rule_text")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!data?.length) return "No rules configured.";

  return (data as Record<string, unknown>[])
    .map((r) => `[${r.severity ?? "info"}] ${r.rule_type}: ${r.rule_text}`)
    .join("\n");
}

async function loadMemories(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("axe_memory")
    .select("memory_type,content,symbol,confidence")
    .eq("user_id", userId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data?.length) return "No memories yet.";

  return (data as Record<string, unknown>[])
    .map(
      (m) =>
        `[${m.memory_type}] ${m.symbol ?? "—"} (${Math.round(Number(m.confidence ?? 0.7) * 100)}%): ${m.content}`,
    )
    .join("\n");
}

/* ── GPT-4o trade alignment analysis ─────────────────────────────── */

async function analyzeTradeAlignment(
  apiKey: string,
  trade: BrokerTrade,
  playbooks: string,
  rules: string,
  memories: string,
): Promise<JournalResult> {
  const tradeText = [
    `Symbol: ${trade.symbol}`,
    `Side: ${trade.side.toUpperCase()}`,
    `Volume: ${trade.volume}`,
    `Open: ${trade.open_price} @ ${trade.open_time?.slice(0, 16) ?? "?"}`,
    `Close: ${trade.close_price} @ ${trade.close_time?.slice(0, 16) ?? "?"}`,
    `PnL: ${trade.pnl}`,
    `Fees: ${trade.fees}`,
    trade.open_price && trade.close_price
      ? `Move: ${Math.abs(Number(trade.close_price) - Number(trade.open_price)).toFixed(5)} (${trade.side === "buy" ? (Number(trade.close_price) > Number(trade.open_price) ? "winner" : "loser") : (Number(trade.close_price) < Number(trade.open_price) ? "winner" : "loser")})`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `You are AXE JOURNAL — the trade analysis engine for AXE Companion OS.
You analyze closed trades against the trader's playbooks, rules, and behavioral memories.

For each trade, produce a journal entry with an ALIGNMENT SCORE (0-100):

Scoring dimensions (each 0-25):
1. RULE ADHERENCE (25pts) — Did the trade follow stated risk and trading rules?
   Examples: risk per trade %, max daily loss, no revenge trading, session rules
2. PLAYBOOK ALIGNMENT (25pts) — Does the trade match a known playbook/strategy?
   Examples: ICT concepts, order block entry, correct timeframe, valid setup
3. RISK MANAGEMENT (25pts) — Was the position sized correctly? SL/TP ratio reasonable?
   Examples: volume vs account, R:R ratio, trailing stops, partial exits
4. EMOTIONAL DISCIPLINE (25pts) — Signs of patience, no FOMO, no revenge?
   Examples: avoiding known weaknesses, waiting for confirmation, not overtrading

If there's insufficient data for a dimension (e.g., no playbooks), score that dimension at 15/25 (neutral) rather than penalizing.

Respond in EXACTLY this JSON (no markdown fences):
{
  "axe_label": "Perfect" | "Good" | "OK" | "Impatient" | "Poor" | "Emotional",
  "axe_note": "One-line summary, e.g. 'Clean M15 order block entry on XAUUSD, held to target'",
  "alignment_score": 78,
  "breakdown": {
    "rule_adherence": 20,
    "playbook_alignment": 18,
    "risk_management": 22,
    "emotional_discipline": 18,
    "explanation": "2-3 sentence analysis with specific references to rules/playbooks/memories"
  }
}

Label mapping:
- Perfect: 90-100 (flawless execution)
- Good: 75-89 (solid, minor deviations)
- OK: 60-74 (acceptable but room for improvement)
- Impatient: 40-59 with signs of rushing
- Poor: 30-59 with rule violations
- Emotional: any score with clear emotional triggers`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `TRADE:\n${tradeText}\n\nPLAYBOOKS:\n${playbooks}\n\nRULES:\n${rules}\n\nMEMORIES:\n${memories}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("No response");

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as JournalResult;

  return {
    axe_label: parsed.axe_label || "OK",
    axe_note: String(parsed.axe_note || "").slice(0, 500),
    alignment_score: Math.max(0, Math.min(100, Number(parsed.alignment_score) || 50)),
    breakdown: {
      rule_adherence: Math.max(0, Math.min(25, Number(parsed.breakdown?.rule_adherence) || 15)),
      playbook_alignment: Math.max(0, Math.min(25, Number(parsed.breakdown?.playbook_alignment) || 15)),
      risk_management: Math.max(0, Math.min(25, Number(parsed.breakdown?.risk_management) || 15)),
      emotional_discipline: Math.max(0, Math.min(25, Number(parsed.breakdown?.emotional_discipline) || 15)),
      explanation: String(parsed.breakdown?.explanation || "").slice(0, 1000),
    },
  };
}
