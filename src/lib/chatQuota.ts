import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chatQuotaFriendlyNotice,
  nextUtcMidnightIso,
  shouldOfferChatUpgrade,
  CHAT_QUOTA_TIMEZONE,
} from "@/lib/billing/chatLimits";

/** Server-only skip for local dev without migration applied. */
export function skipChatQuota(): boolean {
  return process.env.AXE_SKIP_CHAT_QUOTA === "true";
}

/** Comma-separated auth user UUIDs (server env) — unlimited chat without DB row. */
export function isUnlimitedChatUserId(userId: string): boolean {
  const raw =
    process.env.AXE_FULL_ACCESS_USER_IDS ??
    process.env.AXE_UNLIMITED_CHAT_USER_IDS ??
    "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

/** JSON from `axe_chat_quota_status` RPC (shape matches DB function). */
export type ChatQuotaPayload = {
  ok: boolean;
  plan?: string;
  limit?: number;
  used?: number;
  remaining?: number;
  skipped?: boolean;
  timezone?: string;
  resetsAt?: string;
  notice?: string;
  offerUpgrade?: boolean;
};

type TryConsumeRow = {
  allowed?: boolean;
  reason?: string;
  remaining?: number;
  plan?: string;
  limit?: number;
  used?: number;
  timezone?: string;
};

export type TryConsumeResult =
  | { ok: true; consumed: boolean }
  | {
      ok: false;
      quotaExceeded: boolean;
      plan?: string;
      limit?: number;
      used?: number;
      notice: string;
      offerUpgrade: boolean;
      resetsAt: string;
      timezone: string;
    };

/**
 * Atomically reserves one user send for today (UTC). Call before inserting the user message.
 *
 * `consumed` is true when a finite daily slot was decremented (remaining !== -1).
 * Use it to decide whether a later failure should refund via `refundChatQuota`.
 */
export async function tryConsumeChatQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<TryConsumeResult> {
  if (skipChatQuota()) return { ok: true, consumed: false };
  if (isUnlimitedChatUserId(userId)) return { ok: true, consumed: false };

  const { data, error } = await supabase.rpc("axe_chat_try_consume");

  if (error) {
    // RPC missing (migration not applied) — degrade gracefully, allow chat through.
    console.warn("[chatQuota] axe_chat_try_consume failed — allowing chat (quota skipped):", error.message);
    return { ok: true, consumed: false };
  }

  const row = data as TryConsumeRow;
  if (row?.allowed === false) {
    const limit = typeof row.limit === "number" ? row.limit : 20;
    const plan = row.plan ?? "free";
    return {
      ok: false,
      quotaExceeded: row.reason === "daily_limit",
      plan,
      limit,
      used: row.used,
      notice: chatQuotaFriendlyNotice({ plan, limit, used: row.used }),
      offerUpgrade: shouldOfferChatUpgrade(plan),
      resetsAt: nextUtcMidnightIso(),
      timezone: CHAT_QUOTA_TIMEZONE,
    };
  }

  // remaining === -1 means unlimited (exempt) — nothing was decremented.
  const consumed = (row?.remaining ?? -1) !== -1;
  return { ok: true, consumed };
}

/**
 * Gives back one previously-reserved slot for today (UTC). Call when a
 * send was reserved but ultimately produced no AXE reply.
 */
export async function refundChatQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  if (skipChatQuota()) return;
  if (isUnlimitedChatUserId(userId)) return;

  try {
    const { error } = await supabase.rpc("axe_chat_refund");
    if (error) console.error("[chatQuota] axe_chat_refund failed", error);
  } catch (e) {
    console.error("[chatQuota] axe_chat_refund threw", e);
  }
}

/** Enrich a status payload with friendly reset/upgrade fields. */
export function enrichChatQuotaPayload(raw: ChatQuotaPayload | null | undefined): ChatQuotaPayload {
  if (!raw || !raw.ok) return raw ?? { ok: false };
  const limit = raw.limit ?? 0;
  const remaining = raw.remaining ?? 0;
  const atLimit = limit > 0 && remaining === 0;
  return {
    ...raw,
    timezone: raw.timezone ?? CHAT_QUOTA_TIMEZONE,
    resetsAt: nextUtcMidnightIso(),
    notice: atLimit
      ? chatQuotaFriendlyNotice({ plan: raw.plan, limit, used: raw.used })
      : undefined,
    offerUpgrade: atLimit ? shouldOfferChatUpgrade(raw.plan) : false,
  };
}
