import { firstNonEmptyEnv } from "@/lib/envFallback";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordLearningSignal } from "@/services/learningService";
import { scheduleCockpitRefresh } from "@/services/cockpitSnapshotService";
import { llmSimpleChat } from "@/lib/llm/llmRouter";
import { llmFailureAdvice, type LlmFailure } from "@/lib/ops/llmFailure";
import { recordLlmFailure, recordLlmSuccess, type EngineSource } from "@/lib/ops/recordEngineRun";

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
    /**
     * 0–25 each, or null when AXE genuinely could not judge that dimension —
     * no playbooks to align against, no stated rules to adhere to. These used
     * to be `Number(x) || 15`, so a dimension AXE never scored arrived as 15
     * and was indistinguishable from one it had actually read at 15. That 15
     * then became 60/100 inside the cockpit's Execution and Discipline
     * pillars, marked `available: true`. A real 0 became 15 for the same
     * reason: `0 || 15` is 15.
     */
    rule_adherence: number | null;
    playbook_alignment: number | null;
    risk_management: number | null;
    emotional_discipline: number | null;
    explanation: string;
  };
};

export type AutoJournalOutcome =
  | {
      ok: true;
      journaled: number;
      results: Array<{ tradeId: string; symbol: string; alignment_score: number; axe_label: string }>;
      message?: string;
      /** Trades we tried and could not score, with the reason. Never hidden. */
      failed?: number;
      failureReason?: LlmFailure["reason"];
      advice?: string;
    }
  | { ok: false; error: string; status: number; reason?: LlmFailure["reason"]; advice?: string };

const TRADE_COLUMNS =
  "id,symbol,side,volume,open_time,close_time,open_price,close_price,pnl,fees";

/**
 * Journaling used to hard-require OPENAI_API_KEY. It now goes through
 * `llmRouter`, so a reachable Ollama is just as valid a provider — one empty
 * OpenAI wallet should not switch AXE's brain off.
 */
function hasLlmProvider(): boolean {
  return (
    firstNonEmptyEnv("OPENAI_API_KEY", "OPEN_AI_API_KEY") !== null ||
    firstNonEmptyEnv("OLLAMA_URL", "OLLAMA_HOST") !== null
  );
}

/**
 * Journal un-journaled (or explicitly listed) closed trades for an account.
 * Returns a plain result object — callers decide how to surface it.
 */
export async function autoJournalTrades(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  tradeIds?: string[],
  source: EngineSource = "journal",
): Promise<AutoJournalOutcome> {
  if (!hasLlmProvider()) {
    return {
      ok: false,
      error: "no model provider configured",
      status: 503,
      reason: "not_configured",
      advice: llmFailureAdvice("not_configured"),
    };
  }

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
    return journalTrades(supabase, userId, accountId, trades as BrokerTrade[], source);
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

  return journalTrades(supabase, userId, accountId, trades, source);
}

/* ── Core journaling logic ───────────────────────────────────────── */

async function journalTrades(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  trades: BrokerTrade[],
  source: EngineSource,
): Promise<AutoJournalOutcome> {
  const [playbooks, rules, memories] = await Promise.all([
    loadPlaybooks(supabase, userId),
    loadRules(supabase, userId),
    loadMemories(supabase, userId),
  ]);

  let journaled = 0;
  let failed = 0;
  const operatorBlockers: LlmFailure[] = [];
  const results: Array<{ tradeId: string; symbol: string; alignment_score: number; axe_label: string }> = [];

  // Process in batches of 5 for efficiency.
  const batchSize = 5;
  for (let i = 0; i < trades.length; i += batchSize) {
    const batch = trades.slice(i, i + batchSize);

    const startedAt = Date.now();
    const batchResults = await Promise.all(
      batch.map((trade) =>
        analyzeTradeAlignment(trade, playbooks, rules, memories).catch(async (e: unknown) => {
          failed += 1;
          const failure = await recordLlmFailure(supabase, userId, source, e, {
            trade_id: trade.id,
            symbol: trade.symbol,
          });
          // An empty wallet or a dead key will not fix itself in the next
          // 50ms. Stop the run rather than burn the whole backlog on it.
          if (failure.needsOperator) operatorBlockers.push(failure);
          return null;
        }),
      ),
    );

    if (batchResults.some((r) => r !== null)) {
      await recordLlmSuccess(supabase, userId, source, Date.now() - startedAt, {
        batch_size: batch.length,
        scored: batchResults.filter((r) => r !== null).length,
      });
    }

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

    if (operatorBlockers.length > 0) break;
  }

  if (journaled > 0) {
    scheduleCockpitRefresh(supabase, userId);
  }

  // Nothing scored and a human has to act — that is a failure, not a quiet
  // success. Callers (chat, the journal screen, the sweep cron) say so.
  const blockingFailure: LlmFailure | null = operatorBlockers[0] ?? null;
  if (journaled === 0 && blockingFailure) {
    return {
      ok: false,
      error: blockingFailure.message,
      status: 503,
      reason: blockingFailure.reason,
      advice: llmFailureAdvice(blockingFailure.reason),
    };
  }

  return {
    ok: true,
    journaled,
    results,
    ...(failed > 0
      ? {
          failed,
          ...(blockingFailure
            ? {
                failureReason: blockingFailure.reason,
                advice: llmFailureAdvice(blockingFailure.reason),
              }
            : {}),
          message: `Journaled ${journaled} trade(s); ${failed} could not be scored.`,
        }
      : {}),
  };
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

/* ── Trade alignment analysis (router: Ollama first, OpenAI fallback) ── */

async function analyzeTradeAlignment(
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

If there is genuinely nothing to judge a dimension against (e.g. the trader has stated no playbooks), return null for that dimension. Do NOT substitute a neutral score — a 15 nobody measured is read downstream as a measurement. Never penalise a trader for a dimension that does not apply to them.

Respond in EXACTLY this JSON (no markdown fences):
{
  "axe_label": "Perfect" | "Good" | "OK" | "Impatient" | "Poor" | "Emotional",
  "axe_note": "One-line summary, e.g. 'Clean M15 order block entry on XAUUSD, held to target'",
  "alignment_score": 78,
  "breakdown": {
    "rule_adherence": 20,
    "playbook_alignment": null,
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

  const content = (
    await llmSimpleChat(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `TRADE:\n${tradeText}\n\nPLAYBOOKS:\n${playbooks}\n\nRULES:\n${rules}\n\nMEMORIES:\n${memories}`,
        },
      ],
      { temperature: 0.3, maxTokens: 600 },
    )
  )?.trim();

  // The router returns null when every provider is exhausted. Throwing keeps
  // the reason classifiable upstream instead of writing a neutral score.
  if (!content) throw new Error("Empty response from every configured model provider");

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as JournalResult;

  // `Number(x) || fallback` is the wrong shape for a score, twice over: it
  // cannot tell a missing value from a measured zero, and it hides a model
  // that returned nothing behind a plausible number. A dimension AXE did not
  // judge is null; a trade AXE could not score at all is a failure, which the
  // comment above already says is the right outcome.
  const alignment = Number(parsed.alignment_score);
  if (!Number.isFinite(alignment)) {
    throw new Error("Model returned no usable alignment_score");
  }

  return {
    axe_label: parsed.axe_label || "OK",
    axe_note: String(parsed.axe_note || "").slice(0, 500),
    alignment_score: Math.max(0, Math.min(100, alignment)),
    breakdown: {
      rule_adherence: journalDimension(parsed.breakdown?.rule_adherence),
      playbook_alignment: journalDimension(parsed.breakdown?.playbook_alignment),
      risk_management: journalDimension(parsed.breakdown?.risk_management),
      emotional_discipline: journalDimension(parsed.breakdown?.emotional_discipline),
      explanation: String(parsed.breakdown?.explanation || "").slice(0, 1000),
    },
  };
}

/** 0–25, keeping a measured zero, or null when there is nothing there. */
function journalDimension(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(25, n));
}
