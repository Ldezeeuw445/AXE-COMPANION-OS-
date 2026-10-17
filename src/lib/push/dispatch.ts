import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { type PushCategory } from "@/lib/push/categories";
import { buildPushPayload, serializePushPayload, type BuildPushPayloadInput } from "@/lib/push/payload";
import { DEFAULT_PUSH_PREFS, prefsFromProfileRow, shouldSuppressForPrefs } from "@/lib/push/prefs";
import { cooldownForCategory, decideDedup, normalizeEventKey } from "@/lib/push/dedup";
import { deliverWebPushToUser, type DeliverWebPushResult } from "@/lib/push/deliver";

export type DispatchPushInput = Omit<BuildPushPayloadInput, "category" | "eventKey" | "title"> & {
  userId: string;
  category: PushCategory;
  eventKey: string;
  title: string;
  now?: Date;
  /** Skip prefs + quiet hours (used by the signed-in test suite). */
  bypassPrefs?: boolean;
  /** Skip the deliveries table (used when the caller already reserved the key). */
  bypassDedup?: boolean;
  cooldownMs?: number;
  supabase?: SupabaseClient | null;
};

export type DispatchPushResult = DeliverWebPushResult & {
  ok: boolean;
  skipped?: "category_disabled" | "quiet_hours" | "duplicate" | "rate_limited" | "vapid" | "no_subscription";
  url: string;
  eventKey: string;
  category: PushCategory;
};

const MISSING_TABLE = "42P01";
const UNIQUE_VIOLATION = "23505";

export async function loadPushPrefsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReturnType<typeof prefsFromProfileRow>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("preferences,timezone")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    return DEFAULT_PUSH_PREFS;
  }
  return prefsFromProfileRow(data?.preferences, data?.timezone as string | null | undefined);
}

async function claimDelivery(
  supabase: SupabaseClient,
  input: { userId: string; eventKey: string; category: PushCategory; now: Date; cooldownMs: number },
): Promise<{ deliver: boolean; skipped?: "duplicate" | "rate_limited" }> {
  const eventKey = normalizeEventKey(input.eventKey);
  const sentAt = input.now.toISOString();

  const { error: insertError } = await supabase.from("push_event_deliveries").insert({
    user_id: input.userId,
    event_key: eventKey,
    category: input.category,
    last_sent_at: sentAt,
  });

  if (!insertError) {
    return { deliver: true };
  }
  if (insertError.code === MISSING_TABLE) {
    return { deliver: true };
  }
  if (insertError.code !== UNIQUE_VIOLATION) {
    console.warn("[push] dedup insert failed:", insertError.message);
    return { deliver: true };
  }

  const { data } = await supabase
    .from("push_event_deliveries")
    .select("last_sent_at")
    .eq("user_id", input.userId)
    .eq("event_key", eventKey)
    .maybeSingle();

  const lastSentAt = data?.last_sent_at ? Date.parse(data.last_sent_at as string) : null;
  const decision = decideDedup({
    lastSentAt: Number.isFinite(lastSentAt) ? lastSentAt : null,
    now: input.now.getTime(),
    cooldownMs: input.cooldownMs,
  });
  if (!decision.deliver) {
    return { deliver: false, skipped: decision.reason };
  }

  const { error: updateError } = await supabase
    .from("push_event_deliveries")
    .update({ last_sent_at: sentAt, category: input.category })
    .eq("user_id", input.userId)
    .eq("event_key", eventKey);
  if (updateError && updateError.code !== MISSING_TABLE) {
    console.warn("[push] dedup update failed:", updateError.message);
  }
  return { deliver: true };
}

export async function dispatchPushEvent(input: DispatchPushInput): Promise<DispatchPushResult> {
  const now = input.now ?? new Date();
  const supabase = input.supabase ?? createServiceRoleSupabaseClient();
  const payload = buildPushPayload({
    category: input.category,
    eventKey: input.eventKey,
    title: input.title,
    body: input.body,
    symbol: input.symbol,
    timeframe: input.timeframe,
    accountId: input.accountId,
    threadId: input.threadId,
    url: input.url,
    tag: input.tag,
    silent: input.silent,
    requireInteraction: input.requireInteraction,
    actions: input.actions,
  });

  const base = {
    sent: 0,
    total: 0,
    expired: 0,
    url: payload.url,
    eventKey: payload.eventKey,
    category: payload.category,
  };

  if (!supabase) {
    return { ...base, ok: false, skipped: "vapid" };
  }

  if (!input.bypassPrefs) {
    const prefs = await loadPushPrefsForUser(supabase, input.userId);
    const suppressed = shouldSuppressForPrefs(prefs, input.category, now);
    if (suppressed) {
      return { ...base, ok: true, skipped: suppressed };
    }
  }

  if (!input.bypassDedup) {
    const claimed = await claimDelivery(supabase, {
      userId: input.userId,
      eventKey: payload.eventKey,
      category: input.category,
      now,
      cooldownMs: cooldownForCategory(input.category, input.cooldownMs),
    });
    if (!claimed.deliver) {
      return { ...base, ok: true, skipped: claimed.skipped };
    }
  }

  const delivered = await deliverWebPushToUser({
    userId: input.userId,
    payload: serializePushPayload(payload),
    supabase,
  });

  if (delivered.total === 0) {
    return { ...base, ...delivered, ok: true, skipped: "no_subscription" };
  }

  return { ...base, ...delivered, ok: delivered.sent > 0 };
}
