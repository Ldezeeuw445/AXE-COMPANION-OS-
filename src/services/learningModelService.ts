/**
 * Loads the real per-user evidence for the learning model v2, runs it, and
 * stores the result. See `src/lib/axe/learningModel.ts` for the maths and the
 * audit that motivated it.
 *
 * Reads every account the user has (no active-account filter): the brief and
 * the cockpit describe the trader, not whichever account is selected.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { EVIDENCE_ONLY_FILTER } from "@/lib/trading/tradeEvidence";
import {
  computeLearningState,
  learningChanges,
  learningHistory,
  LEARNING_WINDOW_DAYS,
  type LearningChange,
  type LearningHistoryPoint,
  type LearningInput,
  type LearningOverride,
  type LearningState,
} from "@/lib/axe/learningModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_WEEKS = 12;

export type LearningModelView = {
  state: LearningState;
  changes: LearningChange[];
  history: LearningHistoryPoint[];
  overrides: LearningOverride[];
  /** Overrides table missing (migration not applied) — corrections are unavailable. */
  overridesAvailable: boolean;
};

export async function loadLearningInput(
  supabase: SupabaseClient,
  userId: string,
  now: number = Date.now(),
): Promise<{ input: LearningInput; overridesAvailable: boolean } | null> {
  // Enough history for 12 weekly points of a 90-day window.
  const since = new Date(now - (LEARNING_WINDOW_DAYS + HISTORY_WEEKS * 7) * DAY_MS).toISOString();

  const [tradesRes, votesRes, watchRes, overridesRes] = await Promise.all([
    supabase
      .from("broker_trades")
      .select("id, account_id, symbol, open_time, close_time, pnl")
      .eq("user_id", userId)
      .not("close_time", "is", null)
      .gte("close_time", since)
      .or(EVIDENCE_ONLY_FILTER)
      .order("close_time", { ascending: false })
      .limit(2000),
    supabase
      .from("assistant_learning_signals")
      .select("payload, related_message_id, created_at")
      .eq("user_id", userId)
      .eq("signal_type", "message_feedback")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("assistant_memory_entries")
      .select("entry_key")
      .eq("user_id", userId)
      .eq("scope", "watchlist")
      .limit(100),
    supabase
      .from("axe_learning_overrides")
      .select("item_key, action, value, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);

  // A failed trade read is not "no trades" — return null so callers say so.
  if (tradesRes.error) {
    console.error("[learningModel] broker_trades read failed:", tradesRes.error.message);
    return null;
  }

  const trades = (tradesRes.data ?? []) as Array<{
    id: string;
    account_id: string | null;
    symbol: string | null;
    open_time: string | null;
    close_time: string | null;
    pnl: number | null;
  }>;

  let labels: LearningInput["labels"] = [];
  if (trades.length > 0) {
    const ids = trades.map((t) => t.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const results = await Promise.all(
      chunks.map((chunk) =>
        supabase
          .from("trade_journal_labels")
          .select("trade_id, alignment_score")
          .eq("user_id", userId)
          .in("trade_id", chunk),
      ),
    );
    labels = results.flatMap((r) =>
      ((r.data ?? []) as Array<{ trade_id: string; alignment_score: number | null }>).map((l) => ({
        tradeId: l.trade_id,
        axeScore: l.alignment_score,
      })),
    );
  }

  const votes = ((votesRes.data ?? []) as Array<{
    payload: Record<string, unknown> | null;
    related_message_id: string | null;
    created_at: string | null;
  }>)
    .map((v) => {
      const rating = String(v.payload?.rating ?? "").toLowerCase();
      return rating === "up" || rating === "down"
        ? { messageId: v.related_message_id, rating: rating as "up" | "down", at: v.created_at }
        : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const overridesAvailable = !overridesRes.error;
  const overrides: LearningOverride[] = overridesAvailable
    ? ((overridesRes.data ?? []) as Array<{
        item_key: string;
        action: LearningOverride["action"];
        value: string | null;
        created_at: string;
      }>).map((o) => ({ itemKey: o.item_key, action: o.action, value: o.value, createdAt: o.created_at }))
    : [];

  return {
    input: {
      trades: trades.map((t) => ({
        id: t.id,
        accountId: t.account_id,
        symbol: t.symbol,
        openTime: t.open_time,
        closeTime: t.close_time,
        pnl: t.pnl,
      })),
      labels,
      votes,
      declaredSymbols: ((watchRes.data ?? []) as Array<{ entry_key: string | null }>)
        .map((w) => String(w.entry_key ?? ""))
        .filter(Boolean),
      overrides,
      now,
    },
    overridesAvailable,
  };
}

export async function getLearningModel(
  supabase: SupabaseClient,
  userId: string,
  now: number = Date.now(),
): Promise<LearningModelView | null> {
  const loaded = await loadLearningInput(supabase, userId, now);
  if (!loaded) return null;
  const { input, overridesAvailable } = loaded;
  return {
    state: computeLearningState(input),
    changes: learningChanges(input),
    history: learningHistory(input, HISTORY_WEEKS),
    overrides: input.overrides,
    overridesAvailable,
  };
}

/** Called by the daily job. Service-role client. Never throws. */
export async function persistLearningSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; status?: LearningState["status"]; error?: string }> {
  try {
    const view = await getLearningModel(supabase, userId);
    if (!view) return { ok: false, error: "trades_unavailable" };
    const { state, changes, history } = view;
    const { error } = await supabase.from("axe_learning_snapshots").insert({
      user_id: userId,
      captured_at: state.asOf,
      model_version: state.version,
      status: state.status,
      score: state.score,
      confidence: state.confidence,
      data_points: state.dataPoints,
      required_points: state.requiredPoints,
      state,
      changes,
      history,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, status: state.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const FAMILIES = new Set(["setup", "risk", "timing", "focus", "feedback", "all"]);
const SESSIONS = new Set(["london", "newyork", "asia"]);

/** Validate a user correction before it is stored. Pure; exported for tests. */
export function validateOverride(body: unknown):
  | { ok: true; itemKey: string; action: LearningOverride["action"] | "undo"; value: string | null }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body_required" };
  const b = body as Record<string, unknown>;
  const itemKey = String(b.itemKey ?? "").trim();
  const action = String(b.action ?? "");
  const value = b.value == null ? null : String(b.value).trim().slice(0, 200);
  if (!itemKey || itemKey.length > 80 || !/^[a-z]+(:[A-Za-z0-9_]+){0,2}$/.test(itemKey)) {
    return { ok: false, error: "bad_item_key" };
  }
  if (!["correct", "reset", "hide", "undo"].includes(action)) return { ok: false, error: "bad_action" };
  if (action === "reset" && !FAMILIES.has(itemKey)) return { ok: false, error: "reset_needs_family" };
  if (action === "correct") {
    if (itemKey === "timing") {
      if (!value || !SESSIONS.has(value)) return { ok: false, error: "session_must_be_london_newyork_asia" };
    } else if (itemKey === "focus") {
      const list = (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length === 0 || list.length > 20 || list.some((s) => !/^[A-Za-z0-9./_-]{2,20}$/.test(s))) {
        return { ok: false, error: "focus_must_be_symbol_list" };
      }
    } else {
      return { ok: false, error: "only_timing_and_focus_can_be_corrected" };
    }
  }
  return { ok: true, itemKey, action: action as LearningOverride["action"] | "undo", value };
}
