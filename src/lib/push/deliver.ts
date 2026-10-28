import "server-only";

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getVapidPublicKey, getVapidSubject } from "@/lib/env";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { expiredSubscriptionEndpoints } from "@/lib/push/deliverExpired";

export { expiredSubscriptionEndpoints } from "@/lib/push/deliverExpired";

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type DeliverWebPushResult = {
  sent: number;
  total: number;
  expired: number;
};

/**
 * The one call that actually leaves the server.
 *
 * Injectable so a test can drive the real delivery path — prefs, dedup,
 * subscription fan-out, expired-endpoint pruning — without a VAPID keypair and
 * without posting to a push service. Production never passes this; it gets
 * `webpush.sendNotification`.
 */
export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<unknown>;

const webPushSender: PushSender = (subscription, payload) =>
  webpush.sendNotification(subscription, payload);

export function vapidConfigStatus(): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!getVapidSubject()) missing.push("VAPID_SUBJECT");
  if (!getVapidPublicKey()) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!process.env.VAPID_PRIVATE_KEY?.trim()) missing.push("VAPID_PRIVATE_KEY");
  return { ok: missing.length === 0, missing };
}

export function configureWebPushVapid(): boolean {
  const subject = getVapidSubject();
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/** Delete only the expired endpoint rows for this user — never the whole inbox. */
export async function deleteExpiredSubscriptionRows(
  supabase: SupabaseClient,
  userId: string,
  endpoints: string[],
): Promise<number> {
  if (endpoints.length === 0) return 0;
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .in("endpoint", endpoints);
  if (error) {
    console.warn("[push] expired-subscription cleanup failed:", error.message);
    return 0;
  }
  return endpoints.length;
}

export async function loadUserPushSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (error) {
    console.warn("[push] load subscriptions failed:", error.message);
    return [];
  }
  return (data ?? []) as PushSubscriptionRow[];
}

export async function deliverWebPushToUser(input: {
  userId: string;
  payload: string;
  supabase?: SupabaseClient | null;
  /** Test seam — see {@link PushSender}. Omit in production. */
  send?: PushSender;
}): Promise<DeliverWebPushResult> {
  const send = input.send ?? webPushSender;
  // A caller that brought its own sender is not using VAPID, so requiring a
  // keypair would only stop the test that proves this path works.
  if (!input.send && !configureWebPushVapid()) {
    return { sent: 0, total: 0, expired: 0 };
  }
  const supabase = input.supabase ?? createServiceRoleSupabaseClient();
  if (!supabase) {
    return { sent: 0, total: 0, expired: 0 };
  }

  const subs = await loadUserPushSubscriptions(supabase, input.userId);
  if (subs.length === 0) {
    return { sent: 0, total: 0, expired: 0 };
  }

  const results = await Promise.allSettled(
    subs.map((sub) =>
      send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, input.payload),
    ),
  );

  const expired = expiredSubscriptionEndpoints(results, subs);
  const deleted = await deleteExpiredSubscriptionRows(supabase, input.userId, expired);
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent, total: subs.length, expired: deleted };
}
