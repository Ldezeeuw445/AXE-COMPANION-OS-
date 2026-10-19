import type {
  AdaptiveEventType,
  AdaptiveUiClientEvent,
} from "@/types/adaptive";

export function buildAdaptiveClientEvent(
  input: AdaptiveUiClientEvent,
): AdaptiveUiClientEvent {
  return {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

export function chartPreferenceEvent(
  eventType: AdaptiveEventType,
  accountId: string | null,
  payload: Record<string, unknown>,
): AdaptiveUiClientEvent {
  return buildAdaptiveClientEvent({
    accountId,
    eventType,
    route: "/chart",
    payload,
  });
}
