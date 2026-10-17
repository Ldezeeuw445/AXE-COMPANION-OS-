import type { AdaptiveUiClientEvent } from "@/types/adaptive";

export async function trackAdaptiveEvent(
  event: AdaptiveUiClientEvent,
): Promise<void> {
  try {
    await fetch("/api/adaptive/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Adaptive telemetry is best-effort only.
  }
}
