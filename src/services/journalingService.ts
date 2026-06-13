import type { SupabaseClient } from "@supabase/supabase-js";
import { recordLearningSignal } from "@/services/learningService";

/**
 * AXE auto-journaling — shared logic used by both the `/api/axe-journal`
 * route (authenticated request) and the post-MT5-sync trigger in
 * `mt5Cloud.ts` (server action). Keeping it here lets the sync path journal
 * trades IN-PROCESS with the already-authenticated Supabase client instead of
 * making an unauthenticated server-to-server HTTP call (which returned 401 and
 * silently dropped every auto-journal).
 *
 * For each closed trade, AXE analyzes:
 *  - Did it follow playbook rules?
 *  - Did it respect risk rules?
 *  - Did it avoid known weaknesses / leverage known strengths?
 * Producing: axe_label, axe_note, alignment_score (0-100), axe_journal (breakdown).
 */

export type BrokerTrade = {
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

export type JournalResult = {
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

export type AutoJournalOutcome =
  | {
      ok: true;
      journaled: number;
      results: Array<{ tradeId: string; symbol: string; alignment_score: number; axe_label: string }>;
      message?: string;
    }
  | { ok: false; error: string; status: number };

const TRADE_COLUMNS =
  "id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees";

/**
 * Journal un-journaled (or explicitly listed) closed trades for an account.
 * Returns a plain result object — callers decide how to surface it.
 */
export async function autoJournalTrades(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  tradeIds?: string[],
): Promise<AutoJournalOutcome> {
  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY;
  if (!openaiKey) return { ok: false, error: "OPENAI_API_KEY not configured", status: 503 };

  const baseQuery = supabase
    .from("broker_trades")
    .select(TRADE_COLUMNS)
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .not("close_time", "is", null)
    .order("close_time", { ascending: false });

  // Explicit trade list → journal exactly those.
  if (tradeIds?.length) {
    const { data: trades, error } = await baseQuery.in("id", tradeIds);
    if (error) return { ok: false, error: error.message, status: 500 };
    if (!trades?.length) return { ok: true, journaled: 0, results: [] };
    return journalTrades(supabase, userId, accountId, trades as BrokerTrade[], openaiKey);
  }

  // Otherwise: journal recent trades that don't yet have an AXE label.
  const { data: labeled } = await supabase
    .from("trade_journal_labels")
    .select("trade_id")
    .eq("user_id", userId)
    .not("axe_label", "is", null);

  const labeledIds = new Set((labeled ?? []).map((l: { trade_id: string }) => l.trade_id));

  const { data: allTrades, error: tErr } = await baseQuery.limit(20);
  if (tErr) return { ok: false, error: tErr.message, status: 500 };

  const trades = ((allTrades ?? []) as BrokerTrade[]).filter((t) => !labeledIds.has(t.id));
  if (trades.length === 0) {
    return { ok: true, journaled: 0, results: [], message: "All recent trades already journaled" };
  }

  return journalTrades(supabase, userId, accountId, trades, openaiKey);
}

/* ── Core journaling logic ───────────────────────────────────────── */

async function journalTrades(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  trades: BrokerTrade[],
  openaiKey: string,
): Promise<AutoJournalOutcome> {
  const [playbooks, rules, memories] = await Promise.all([
    loadPlaybooks(supabase, userId),
    loadRules(supabase, userId),
    loadMemories(supabase, userId),
  ]);

  let journaled = 0;
  const results: Array<{ tradeId: string; symbol: string; alignment_score: number; axe_label: string }> = [];

  // Process in batches of 5 for efficiency.
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

      // Behavioral signal so the cockpit alignment score is grounded in AXE's
      // actual per-trade assessments rather than a one-off GPT guess.
      await recordLearningSignal(supabase, userId, "trade_alignment", {
        trade_id: trade.id,
        symbol: trade.symbol,
        alignment_score: result.alignment_score,
        axe_label: result.axe_label,
      });
    }
  }

  return { ok: true, journaled, results };
}

/* ── Load trader context ─────────────────────────────────────────── */

async function loadPlaybooks(supabase: SupabaseClient, userId: string): Promise<string> {
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

async function loadRules(supabase: SupabaseClient, userId: string): Promise<string> {
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

async function loadMemories(supabase: SupabaseClient, userId: string): Promise<string> {
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

/* ── GPT-4o-mini trade alignment analysis ────────────────────────── */

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
