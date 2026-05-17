import type { LearningMetricPreview } from "@/types/domain";
import { getAuthedServiceSupabase } from "@/services/serviceSupabase";

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
