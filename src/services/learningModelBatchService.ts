import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { filterUsersWithFeature } from "@/services/entitledUsers";
import { persistLearningSnapshot } from "@/services/learningModelService";

export type LearningModelBatchSummary = {
  attempted: number;
  scored: number;
  learning: number;
  failed: number;
};

/** One learning-model snapshot per entitled user. Never throws. */
export async function runLearningModelBatch(
  supabase: SupabaseClient,
  opts?: { maxUsers?: number; userIds?: string[] },
): Promise<LearningModelBatchSummary> {
  const summary: LearningModelBatchSummary = { attempted: 0, scored: 0, learning: 0, failed: 0 };
  let userIds = opts?.userIds;
  if (!userIds) {
    const { data, error } = await supabase.from("axe_user_entitlements").select("user_id").limit(500);
    if (error) {
      console.error("[learningModelBatch] entitlements load failed", error.message);
      return summary;
    }
    const candidates = (data ?? []).map((r) => r.user_id as string);
    const entitled = await filterUsersWithFeature(supabase, candidates, "cockpit_learning");
    userIds = candidates.filter((id) => entitled.has(id));
  }
  for (const userId of userIds.slice(0, opts?.maxUsers ?? 60)) {
    summary.attempted += 1;
    const r = await persistLearningSnapshot(supabase, userId);
    if (!r.ok) {
      summary.failed += 1;
      console.warn("[learningModelBatch] failed", userId.slice(0, 8), r.error);
    } else if (r.status === "scored") summary.scored += 1;
    else summary.learning += 1;
  }
  return summary;
}
