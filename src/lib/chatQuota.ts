import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only skip for local dev without migration applied. */
export function skipChatQuota(): boolean {
  return process.env.AXE_SKIP_CHAT_QUOTA === "true";
}

/** Comma-separated auth user UUIDs (Vercel env) — unlimited chat without DB row. */
export function isUnlimitedChatUserId(userId: string): boolean {
  const raw = process.env.AXE_UNLIMITED_CHAT_USER_IDS ?? "";
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
};

type TryConsumeRow = {
  allowed?: boolean;
  reason?: string;
  remaining?: number;
};

/**
 * Atomically reserves one user send for today (UTC). Call before inserting the user message.
 *
 * `consumed` is true only when a free-tier daily slot was actually decremented
 * (i.e. not pro / exempt / skipped). Use it to decide whether a later failure
 * should refund the slot via `refundChatQuota`.
 */
export async function tryConsumeChatQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true; consumed: boolean } | { ok: false; quotaExceeded: boolean }> {
  if (skipChatQuota()) return { ok: true, consumed: false };
  if (isUnlimitedChatUserId(userId)) return { ok: true, consumed: false };

  const { data, error } = await supabase.rpc("axe_chat_try_consume");

  if (error) {
    console.error("[chatQuota] axe_chat_try_consume failed", error);
    return { ok: false, quotaExceeded: false };
  }

  const row = data as TryConsumeRow;
  if (row?.allowed === false) {
    return {
      ok: false,
      quotaExceeded: row.reason === "daily_limit",
    };
  }

  // remaining === -1 means unlimited (pro/exempt) — nothing was decremented.
  const consumed = (row?.remaining ?? -1) !== -1;
  return { ok: true, consumed };
}

/**
 * Gives back one previously-reserved free-tier slot for today (UTC). Call when a
 * send was reserved but ultimately produced no AXE reply (e.g. the AI call
 * failed), so the user isn't charged for a message they never received.
 *
 * Best-effort: failures are logged, never thrown.
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
