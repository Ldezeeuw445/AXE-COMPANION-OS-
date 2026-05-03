import { mockLearningMetrics } from "@/services/mock/seed";
import type { LearningMetricPreview } from "@/types/domain";

/**
 * Phase 2 Assistant Cockpit: aggregate assistant_learning_signals +
 * assistant_learning_metrics + assistant_cockpit_snapshots.
 */
export async function listLearningMetricsPreview(): Promise<
  LearningMetricPreview[]
> {
  return mockLearningMetrics;
}
