import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { userMessageForCode } from "@/lib/mt5/metaApiErrors";

/**
 * TOS-SEC-2: MT5 / hub account writes must not depend on end-user INSERT/UPDATE
 * grants on `broker_trades` / `user_broker_accounts`. Prefer the service-role
 * client so authenticated RLS can stay SELECT-only
 * (`20260705120000_tos_sec2_broker_tables_select_only.sql`).
 *
 * Ownership is still enforced by the caller (user session read + userId filter).
 *
 * Fail-closed: without a service-role key, mutations refuse with a clear error
 * instead of silently falling back to the session client (which cannot write
 * after the SELECT-only migration). Local/dev may opt in with
 * `AXE_ALLOW_SESSION_BROKER_WRITES=true` (never set in production).
 */

export const MT5_SYNC_WRITE_UNAVAILABLE_CODE = "service_role_required" as const;

export class Mt5SyncWriteClientUnavailableError extends Error {
  readonly code = MT5_SYNC_WRITE_UNAVAILABLE_CODE;

  constructor(message = userMessageForCode("service_role_required")) {
    super(message);
    this.name = "Mt5SyncWriteClientUnavailableError";
  }
}

/**
 * Explicit opt-in for local/dev without SUPABASE_SERVICE_ROLE_KEY.
 * Flag accepts: "1", "true", "yes", "on" (case-insensitive).
 *
 * Production guard: implement `shouldBlockSessionBrokerWritesInProduction`
 * below — when that returns true, this function always returns false.
 */
export function allowSessionBrokerWrites(
  envGet: (key: string) => string = (key) => process.env[key] ?? "",
): boolean {
  if (shouldBlockSessionBrokerWritesInProduction(envGet)) return false;
  const flag = envGet("AXE_ALLOW_SESSION_BROKER_WRITES").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/**
 * Security vs. local DX: should production ignore AXE_ALLOW_SESSION_BROKER_WRITES?
 *
 * Return true to refuse session broker writes in production even if the flag
 * is set (safer once SELECT-only RLS is live). Return false to honor the flag
 * in every environment (handy for staging clones that share prod NODE_ENV).
 */
export function shouldBlockSessionBrokerWritesInProduction(
  envGet: (key: string) => string = (key) => process.env[key] ?? "",
): boolean {
  // TODO(learning): implement production guard — see session prompt.
  // Hint: check envGet("VERCEL_ENV") === "production" and/or NODE_ENV.
  void envGet;
  return false;
}

export type Mt5SyncWriteClientOk = {
  ok: true;
  client: SupabaseClient;
  viaServiceRole: boolean;
};

export type Mt5SyncWriteClientFail = {
  ok: false;
  code: typeof MT5_SYNC_WRITE_UNAVAILABLE_CODE;
  message: string;
};

export type Mt5SyncWriteClientResult = Mt5SyncWriteClientOk | Mt5SyncWriteClientFail;

/**
 * Soft resolve for best-effort / Result-typed paths.
 * Prefer this when the caller can return `{ ok: false }` or skip a write.
 */
export function tryResolveMt5SyncWriteClient(
  sessionClient: SupabaseClient,
): Mt5SyncWriteClientResult {
  const service = createServiceRoleSupabaseClient();
  if (service) return { ok: true, client: service, viaServiceRole: true };

  if (allowSessionBrokerWrites()) {
    return { ok: true, client: sessionClient, viaServiceRole: false };
  }

  return {
    ok: false,
    code: MT5_SYNC_WRITE_UNAVAILABLE_CODE,
    message: userMessageForCode("service_role_required"),
  };
}

/**
 * Hard resolve — throws when service role is missing and session writes are
 * not explicitly allowed. Use in adapters where failure should abort the op.
 */
export function resolveMt5SyncWriteClient(
  sessionClient: SupabaseClient,
): { client: SupabaseClient; viaServiceRole: boolean } {
  const resolved = tryResolveMt5SyncWriteClient(sessionClient);
  if (!resolved.ok) {
    throw new Mt5SyncWriteClientUnavailableError(resolved.message);
  }
  return { client: resolved.client, viaServiceRole: resolved.viaServiceRole };
}

export function isMt5SyncWriteUnavailable(
  error: unknown,
): error is Mt5SyncWriteClientUnavailableError {
  return (
    error instanceof Mt5SyncWriteClientUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === MT5_SYNC_WRITE_UNAVAILABLE_CODE)
  );
}
