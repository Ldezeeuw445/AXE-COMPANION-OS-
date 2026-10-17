import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyLlmFailure,
  llmFailureAdvice,
  noteLlmFailure,
  noteLlmSuccess,
  type LlmFailure,
} from "./llmFailure";

/**
 * Persist model successes and failures to `axe_engine_runs` so a dead engine
 * leaves a trail outside this process, and keep the in-memory registry in step
 * so `/api/debug/cron-health` can answer without a database round-trip.
 *
 * Recording must never be the reason a feature fails: every write here is
 * best-effort and swallows its own errors.
 */

export type EngineSource =
  | "journal"
  | "journal_sweep"
  | "intel_correlate"
  | "briefing"
  | "knowledge_distil";

export async function recordLlmFailure(
  supabase: SupabaseClient,
  userId: string,
  source: EngineSource,
  err: unknown,
  details: Record<string, unknown> = {},
): Promise<LlmFailure> {
  const failure = classifyLlmFailure(err);
  noteLlmFailure(source, failure);

  try {
    await supabase.from("axe_engine_runs").insert({
      user_id: userId,
      source,
      status: "error",
      details: {
        ...details,
        llm_reason: failure.reason,
        retryable: failure.retryable,
        needs_operator: failure.needsOperator,
        advice: llmFailureAdvice(failure.reason),
      },
      error: `${failure.reason}: ${failure.message}`.slice(0, 500),
    });
  } catch {
    /* visibility is best-effort; never block the caller */
  }

  // Loud on purpose. A silent console.error is how this went unnoticed for weeks.
  console.error(
    `[axe-engine] ${source} FAILED (${failure.reason}) — ${llmFailureAdvice(failure.reason)} — ${failure.message}`,
  );

  return failure;
}

export async function recordLlmSuccess(
  supabase: SupabaseClient,
  userId: string,
  source: EngineSource,
  latencyMs: number,
  details: Record<string, unknown> = {},
): Promise<void> {
  noteLlmSuccess(source);
  try {
    await supabase.from("axe_engine_runs").insert({
      user_id: userId,
      source,
      status: "ok",
      latency_ms: latencyMs,
      details,
    });
  } catch {
    /* best-effort */
  }
}
