import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { unknownFailureDetail, type Mt5CloudErrorCode } from "@/lib/mt5/metaApiErrors";

/**
 * A failed MT5 connect, written where anyone with database access can read it
 * (axe_client_errors, source "mt5_connect") — not only to a VPS log that needs
 * SSH. 22 Nov 2026: every connect failed with "unknown" and no one could see
 * MetaApi's answer.
 *
 * Never the request itself: no password, no token, no MT5 login. The broker
 * server name and the region are kept; they are what a failure usually hinges on.
 * Writing this must never break the connect it describes, so it swallows its own
 * errors.
 */
export async function recordMt5ConnectFailure(input: {
  userId: string;
  step: string;
  code: Mt5CloudErrorCode;
  error: unknown;
  server?: string | null;
  region?: string | null;
}): Promise<void> {
  try {
    const service = createServiceRoleSupabaseClient();
    if (!service) return;
    const detail = unknownFailureDetail(input.error);
    const status =
      input.error && typeof input.error === "object" && typeof (input.error as { status?: unknown }).status === "number"
        ? (input.error as { status: number }).status
        : null;
    await service.from("axe_client_errors").insert({
      user_id: input.userId,
      source: "mt5_connect",
      message: `${input.code} at ${input.step}${detail ? `: ${detail}` : ""}`.slice(0, 2000),
      extra: {
        step: input.step,
        code: input.code,
        status,
        detail,
        server: input.server ?? null,
        region: input.region ?? null,
      },
    });
  } catch {
    /* diagnostics only */
  }
}
