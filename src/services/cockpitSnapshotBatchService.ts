import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { filterUsersWithFeature } from "@/services/entitledUsers";
import { generateCockpitSnapshot } from "@/services/cockpitSnapshotService";
import { refreshAxeEngineProfile } from "@/services/axeEngineService";

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
    .select("user_id")
    .limit(500);

  if (error) {
    console.error("[cockpitSnapshotBatch] entitlements load failed", error.message);
    return summary;
  }

  // Same entitlement a request would see — including "an anonymous user is
  // never paid". The raw rows were enough to bill model calls to 51 anonymous
  // "founder" accounts minted by the old demo route.
  const candidateIds = (entitlements ?? []).map((row) => row.user_id as string);
  const entitled = await filterUsersWithFeature(supabase, candidateIds, "cockpit_learning");
  const paidUserIds = candidateIds.filter((id) => entitled.has(id)).slice(0, maxUsers);

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
    await refreshAxeEngineProfile(supabase, userId, "cockpit_batch").catch((err) =>
      console.warn("[cockpitSnapshotBatch] engine refresh failed", userId, err instanceof Error ? err.message : String(err)),
    );
  }

  return summary;
}
