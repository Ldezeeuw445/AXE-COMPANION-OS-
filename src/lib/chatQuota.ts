import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-only skip for local dev without migration applied. */
export function skipChatQuota(): boolean {
  return process.env.AXE_SKIP_CHAT_QUOTA === "true";
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
 */
export async function tryConsumeChatQuota(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; quotaExceeded: boolean }> {
  if (skipChatQuota()) return { ok: true };

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

  return { ok: true };
}
