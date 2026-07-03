/**
 * Server-side adaptive event tracking
 * Logs events for analysis; client-side tracking happens via API calls
 */

interface AdaptiveEventPayload {
  [key: string]: unknown;
}

export async function trackAdaptiveEvent(options: {
  accountId?: string | null;
  eventType: string;
  route?: string;
  payload?: AdaptiveEventPayload;
  occurredAt?: string;
}): Promise<void> {
  try {
    // Log for monitoring and debugging
    console.log('[Adaptive Event]', {
      type: options.eventType,
      route: options.route,
      payload: options.payload,
      timestamp: options.occurredAt || new Date().toISOString(),
    });

    // TODO: Integrate with Supabase to store adaptive_ui_events
    // For now, this is telemetry-only (best-effort)
  } catch (error) {
    // Adaptive telemetry is best-effort only
    console.warn('[Adaptive Event] Tracking failed:', error);
  }
}
