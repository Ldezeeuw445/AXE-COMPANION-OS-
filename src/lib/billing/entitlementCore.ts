import { isPaidAxePlan } from "@/lib/billing/tiers";
import { normalizeAxePlan } from "@/lib/billing/features";
import type { UserAxeEntitlement } from "@/lib/billing/types";

/**
 * Pure entitlement logic — no I/O, so the rules can be tested without a database.
 *
 * Why anonymous users get their own rule: until 2026-10-11 `POST /api/auth/demo`
 * minted an anonymous Supabase user and, with the service role, upserted
 * `plan=founder, founder_badge=true, chat_quota_exempt=true` for it. The route
 * is gone and the proxy rejects anonymous sessions, but the rows it wrote
 * (51 of them on 2026-09-11, minted by the pre-fix build still running in
 * production) still say "founder", and every server job that reads the table
 * (cockpit batch, briefings, watcher, chat RPCs) believed them. The rule here
 * is the other half of the fix: an anonymous auth user is never paid, whatever
 * the row says. Nothing is rewritten — the row stays as evidence; it is simply
 * not honoured.
 */

export type EntitlementRow = {
  plan?: unknown;
  pro_until?: unknown;
  chat_quota_exempt?: unknown;
  founder_badge?: unknown;
  stripe_customer_id?: unknown;
  stripe_subscription_id?: unknown;
} | null;

/** Builds the entitlement the app works with from a raw `axe_user_entitlements` row. */
export function entitlementFromRow(data: EntitlementRow | undefined, nowMs = Date.now()): UserAxeEntitlement {
  const plan = normalizeAxePlan(data?.plan as string | undefined);
  const proUntil = (data?.pro_until as string | null | undefined) ?? null;
  const chatQuotaExempt = data?.chat_quota_exempt === true;
  const founderBadge = data?.founder_badge === true;
  const paidUntilActive = proUntil ? new Date(proUntil).getTime() > nowMs : false;

  const isPaid =
    chatQuotaExempt || isPaidAxePlan(plan) || (plan === "free" && paidUntilActive);

  return {
    plan: isPaid && plan === "free" && paidUntilActive ? "pro" : plan,
    isPaid,
    founderBadge,
    proUntil,
    chatQuotaExempt,
    stripeCustomerId: (data?.stripe_customer_id as string | null | undefined) ?? null,
    stripeSubscriptionId: (data?.stripe_subscription_id as string | null | undefined) ?? null,
    label:
      founderBadge || plan === "founder"
        ? "Founder"
        : plan === "elite"
          ? "Elite"
          : isPaid && plan === "free"
            ? "Pro"
            : plan === "pro"
              ? "Pro"
              : "Free",
  };
}

/** True when the entitlement would unlock anything beyond Free. */
export function isPaidShaped(ent: UserAxeEntitlement): boolean {
  return ent.isPaid || ent.founderBadge || ent.chatQuotaExempt || isPaidAxePlan(ent.plan);
}

/** The Free entitlement an anonymous auth user is held to, whatever its row says. */
export function clampAnonymousEntitlement(ent: UserAxeEntitlement): UserAxeEntitlement {
  return {
    ...ent,
    plan: "free",
    isPaid: false,
    founderBadge: false,
    chatQuotaExempt: false,
    proUntil: null,
    label: "Free",
  };
}

/**
 * Applies the anonymous rule given what we know about the user.
 *
 * `anonymous` is `true` / `false` when the auth lookup answered, `null` when it
 * could not (network error, no service role). Unknown fails CLOSED for a paid
 * row that has no Stripe subscription behind it — a subscription proves a real
 * checkout by a real account — and stays as-is for a row with one, so a
 * transient auth-API failure never downgrades a paying customer.
 */
export function applyAnonymousRule(
  ent: UserAxeEntitlement,
  anonymous: boolean | null,
): UserAxeEntitlement {
  if (!isPaidShaped(ent)) return ent;
  if (anonymous === true) return clampAnonymousEntitlement(ent);
  if (anonymous === null && !ent.stripeSubscriptionId) return clampAnonymousEntitlement(ent);
  return ent;
}

/**
 * A small TTL cache around an auth lookup. Only definitive answers are cached;
 * an error is retried on the next call.
 */
export function createAnonymityResolver(
  lookup: (userId: string) => Promise<boolean | null>,
  opts: { ttlMs?: number; now?: () => number; maxEntries?: number } = {},
): (userId: string) => Promise<boolean | null> {
  const ttlMs = opts.ttlMs ?? 10 * 60 * 1000;
  const now = opts.now ?? Date.now;
  const maxEntries = opts.maxEntries ?? 2000;
  const cache = new Map<string, { value: boolean; expires: number }>();
  return async (userId: string) => {
    const hit = cache.get(userId);
    if (hit && hit.expires > now()) return hit.value;
    const value = await lookup(userId);
    if (value === null) return null;
    if (cache.size >= maxEntries) cache.clear();
    cache.set(userId, { value, expires: now() + ttlMs });
    return value;
  };
}
