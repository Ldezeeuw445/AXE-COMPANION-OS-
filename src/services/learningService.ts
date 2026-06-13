import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningMetricPreview } from "@/types/domain";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

/**
 * Append a learning signal — an append-only behavioral event used to make the
 * Assistant Cockpit alignment score reflect what the trader actually does
 * (journaling, accepting/rejecting AXE's read) instead of a pure GPT guess.
 *
 * Best-effort: never throws, so it can't break the user-facing action it rides
 * along with. The `assistant_learning_signals` table is RLS-scoped to user_id.
 */
export type LearningSignalType =
  | "journal_label" // user manually tagged a closed trade
  | "trade_alignment" // AXE auto-journaled a trade with an alignment score
  | "ai_correction"; // user corrected AXE in chat

export async function recordLearningSignal(
  supabase: SupabaseClient,
  userId: string,
  signalType: LearningSignalType,
  payload: Record<string, unknown>,
  related?: { messageId?: string | null; executionRequestId?: string | null },
): Promise<void> {
  try {
    const { error } = await supabase.from("assistant_learning_signals").insert({
      user_id: userId,
      signal_type: signalType,
      payload,
      related_message_id: related?.messageId ?? null,
      related_execution_request_id: related?.executionRequestId ?? null,
    });
    if (error) console.error("[learningService] recordLearningSignal failed", error.message);
  } catch (e) {
    console.error("[learningService] recordLearningSignal threw", e);
  }
}

/**
 * Aggregate recorded learning signals into the cockpit's feedback figures.
 * "Aligned" = the trader's manual label was positive (Perfect/Good/OK) or AXE's
 * auto-alignment scored >= 60; otherwise "misaligned". `corrections` counts
 * explicit teaching moments (manual labels + chat corrections).
 */
export type LearningSignalSummary = {
  total: number;
  aligned: number;
  misaligned: number;
  corrections: number;
};

const POSITIVE_LABELS = new Set(["perfect", "good", "ok"]);

export async function summarizeLearningSignals(
  supabase: SupabaseClient,
  userId: string,
  sinceIso?: string,
): Promise<LearningSignalSummary> {
  const empty: LearningSignalSummary = { total: 0, aligned: 0, misaligned: 0, corrections: 0 };
  try {
    let query = supabase
      .from("assistant_learning_signals")
      .select("signal_type,payload,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (sinceIso) query = query.gte("created_at", sinceIso);

    const { data, error } = await query;
    if (error || !data) return empty;

    const summary = { ...empty, total: data.length };
    for (const row of data as Array<{ signal_type: string; payload: Record<string, unknown> | null }>) {
      const payload = row.payload ?? {};
      if (row.signal_type === "journal_label") {
        summary.corrections += 1;
        const label = String(payload.label ?? "").toLowerCase();
        if (label && POSITIVE_LABELS.has(label)) summary.aligned += 1;
        else if (label) summary.misaligned += 1;
      } else if (row.signal_type === "trade_alignment") {
        const score = Number(payload.alignment_score ?? 0);
        if (score >= 60) summary.aligned += 1;
        else summary.misaligned += 1;
      } else if (row.signal_type === "ai_correction") {
        summary.corrections += 1;
        summary.misaligned += 1;
      }
    }
    return summary;
  } catch {
    return empty;
  }
}

/**
 * Assistant Cockpit preview — reads from `assistant_learning_metrics`
 * if the table exists, otherwise returns an empty list so the UI can
 * render an honest "no signals yet" state instead of mock numbers.
 *
 * Mock seed data was previously returned unconditionally — that's been
 * removed to avoid hard-coded "82% alignment" on fresh accounts.
 */
export async function listLearningMetricsPreview(): Promise<
  LearningMetricPreview[]
> {
  const authed = await getAuthedServiceSupabase();
  if (!authed) return [];
  const { supabase, user } = authed;

  type Row = {
    metric_key: string | null;
    metric_value: number | string | null;
    dimensions: Record<string, unknown> | null;
  };

  const { data, error } = await supabase
    .from("assistant_learning_metrics")
    .select("metric_key,metric_value,dimensions")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error || !data) return [];

  return (data as Row[])
    .filter((row): row is Row & { metric_key: string } => Boolean(row.metric_key))
    .map((row) => {
      const numeric =
        typeof row.metric_value === "number"
          ? row.metric_value
          : typeof row.metric_value === "string"
            ? Number(row.metric_value)
            : 0;
      const safeValue = Number.isFinite(numeric) ? numeric : 0;
      const label =
        typeof row.dimensions?.label === "string"
          ? row.dimensions.label
          : row.metric_key.replace(/[_-]/g, " ");
      const trend: LearningMetricPreview["trend"] =
        row.dimensions?.trend === "up" ||
        row.dimensions?.trend === "down" ||
        row.dimensions?.trend === "flat"
          ? row.dimensions.trend
          : undefined;
      return {
        metricKey: row.metric_key,
        label,
        value: safeValue,
        ...(trend ? { trend } : {}),
      };
    });
}
