import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import type { AdaptiveEventType } from "@/types/adaptive";

/**
 * Server-side adaptive event tracking.
 * Client-side events go through /api/adaptive/events with the user's session;
 * server jobs (cron briefings) have no session, so they write with the
 * service role. RLS on adaptive_ui_events only allows a user to insert their
 * own rows, which a cron cannot satisfy.
 */

interface AdaptiveEventPayload {
  [key: string]: unknown;
}

export async function trackAdaptiveEvent(
  options: {
    userId: string;
    accountId?: string | null;
    eventType: AdaptiveEventType;
    route: string;
    sessionId?: string | null;
    payload?: AdaptiveEventPayload;
    occurredAt?: string;
  },
  client?: SupabaseClient | null,
): Promise<void> {
  try {
    const supabase = client ?? createServiceRoleSupabaseClient();
    if (!supabase) return;

    const { error } = await supabase.from("adaptive_ui_events").insert({
      user_id: options.userId,
      account_id: options.accountId ?? null,
      event_type: options.eventType,
      route: options.route,
      session_id: options.sessionId ?? null,
      occurred_at: options.occurredAt ?? new Date().toISOString(),
      payload: options.payload ?? {},
    });

    if (error) {
      console.warn("[Adaptive Event] Insert failed:", options.eventType, error.message);
    }
  } catch (error) {
    // Adaptive telemetry is best-effort only
    console.warn("[Adaptive Event] Tracking failed:", error);
  }
}
