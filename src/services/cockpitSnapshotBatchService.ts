import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPaidAxePlan } from "@/lib/billing/tiers";
import { generateCockpitSnapshot } from "@/services/cockpitSnapshotService";

export type CockpitSnapshotBatchSummary = {
  attempted: number;
  generated: number;
  skipped: number;
  failed: number;
};

export async function runCockpitSnapshotBatch(
  supabase: SupabaseClient,
  opts?: { maxUsers?: number },
): Promise<CockpitSnapshotBatchSummary> {
  const maxUsers = opts?.maxUsers ?? 30;
  const summary: CockpitSnapshotBatchSummary = {
    attempted: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
  };

  const { data: entitlements, error } = await supabase
    .from("axe_user_entitlements")
    .select("user_id,plan,chat_quota_exempt,pro_until")
    .limit(500);

  if (error) {
    console.error("[cockpitSnapshotBatch] entitlements load failed", error.message);
    return summary;
  }

  const now = Date.now();
  const paidUserIds = (entitlements ?? [])
    .filter((row) => {
      if (row.chat_quota_exempt === true) return true;
      if (isPaidAxePlan(row.plan as string)) return true;
      const proUntil = row.pro_until ? new Date(String(row.pro_until)).getTime() : 0;
      return proUntil > now;
    })
    .map((row) => row.user_id as string)
    .slice(0, maxUsers);

  for (const userId of paidUserIds) {
    summary.attempted += 1;
    const result = await generateCockpitSnapshot(supabase, userId);
    if (result.ok) {
      summary.generated += 1;
    } else if (result.status === 422) {
      summary.skipped += 1;
    } else {
      summary.failed += 1;
      console.warn("[cockpitSnapshotBatch] failed", userId, result.error);
    }
  }

  return summary;
}
