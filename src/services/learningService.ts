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
    label: string | null;
    value: number | string | null;
    trend: string | null;
  };

  const { data, error } = await supabase
    .from("assistant_learning_metrics")
    .select("metric_key,label,value,trend")
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: false })
    .limit(8);

  if (error || !data) return [];

  return (data as Row[])
    .filter((row): row is Row & { metric_key: string; label: string } =>
      Boolean(row.metric_key && row.label),
    )
    .map((row) => {
      const numeric =
        typeof row.value === "number"
          ? row.value
          : typeof row.value === "string"
            ? Number(row.value)
            : 0;
      const safeValue = Number.isFinite(numeric) ? numeric : 0;
      const trend: LearningMetricPreview["trend"] =
        row.trend === "up" || row.trend === "down" || row.trend === "flat"
          ? row.trend
          : undefined;
      return {
        metricKey: row.metric_key,
        label: row.label,
        value: safeValue,
        ...(trend ? { trend } : {}),
      };
    });
}
