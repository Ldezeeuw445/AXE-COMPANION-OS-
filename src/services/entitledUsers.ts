import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasEntitlementFeature } from "@/lib/billing/access";
import { isAnonymousAuthUser } from "@/lib/billing/anonymousUsers";
import { applyAnonymousRule, entitlementFromRow } from "@/lib/billing/entitlementCore";
import type { AxeFeature } from "@/lib/billing/features";

const CHUNK = 150;

/**
 * Which of these users may use `feature`, decided exactly the way a request
 * would decide it (`hasEntitlementFeature` over the same entitlement, including
 * the anonymous rule) — for background jobs that act on many users at once and
 * so never pass through a route gate.
 *
 * A job that loops over users is a route with no front door. The cron that
 * builds cockpit snapshots, the morning briefing and the proactive watcher each
 * spend model calls and push messages per user; without this they spent them on
 * free and anonymous accounts too.
 *
 * Fails closed: if the entitlement read errors, nobody in that chunk passes.
 */
export async function filterUsersWithFeature(
  supabase: SupabaseClient,
  userIds: readonly string[],
  feature: AxeFeature,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  const unique = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("axe_user_entitlements")
      .select("user_id, plan, pro_until, chat_quota_exempt, founder_badge, stripe_customer_id, stripe_subscription_id")
      .in("user_id", chunk);
    if (error) {
      console.error("[entitledUsers] entitlement read failed", error.message);
      continue;
    }
    const rows = new Map((data ?? []).map((r) => [String(r.user_id), r]));
    for (const id of chunk) {
      const raw = entitlementFromRow(rows.get(id) ?? null);
      const needsLookup = raw.isPaid || raw.founderBadge || raw.chatQuotaExempt;
      const ent = needsLookup ? applyAnonymousRule(raw, await isAnonymousAuthUser(id)) : raw;
      if (hasEntitlementFeature(ent, feature, id)) allowed.add(id);
    }
  }
  return allowed;
}
