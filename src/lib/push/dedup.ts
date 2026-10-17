import { PUSH_CATEGORY_COOLDOWN_MS, type PushCategory } from "@/lib/push/categories";

export type DedupDecision =
  | { deliver: true; reason: "first" | "cooldown_elapsed" }
  | { deliver: false; reason: "duplicate" | "rate_limited"; retryAfterMs: number };

export type DedupRecord = {
  userId: string;
  eventKey: string;
  lastSentAt: number;
  category: PushCategory;
};

export function normalizeEventKey(raw: string): string {
  return raw.trim().slice(0, 240);
}

export function decideDedup(input: {
  lastSentAt: number | null;
  now: number;
  cooldownMs: number;
}): DedupDecision {
  if (input.lastSentAt == null) {
    return { deliver: true, reason: "first" };
  }
  const elapsed = input.now - input.lastSentAt;
  if (elapsed >= input.cooldownMs) {
    return { deliver: true, reason: "cooldown_elapsed" };
  }
  return {
    deliver: false,
    reason: elapsed <= 0 ? "duplicate" : "rate_limited",
    retryAfterMs: Math.max(0, input.cooldownMs - elapsed),
  };
}

export function cooldownForCategory(category: PushCategory, overrideMs?: number): number {
  if (typeof overrideMs === "number" && Number.isFinite(overrideMs) && overrideMs >= 0) {
    return overrideMs;
  }
  return PUSH_CATEGORY_COOLDOWN_MS[category];
}

/**
 * In-memory store used by unit tests. Production uses `push_event_deliveries`.
 */
export function createMemoryDedupStore() {
  const rows = new Map<string, DedupRecord>();
  const keyOf = (userId: string, eventKey: string) => `${userId}::${eventKey}`;

  return {
    claim(input: {
      userId: string;
      eventKey: string;
      category: PushCategory;
      now?: number;
      cooldownMs?: number;
    }): DedupDecision {
      const eventKey = normalizeEventKey(input.eventKey);
      const now = input.now ?? Date.now();
      const cooldownMs = cooldownForCategory(input.category, input.cooldownMs);
      const existing = rows.get(keyOf(input.userId, eventKey));
      const decision = decideDedup({
        lastSentAt: existing?.lastSentAt ?? null,
        now,
        cooldownMs,
      });
      if (decision.deliver) {
        rows.set(keyOf(input.userId, eventKey), {
          userId: input.userId,
          eventKey,
          category: input.category,
          lastSentAt: now,
        });
      }
      return decision;
    },
    get(userId: string, eventKey: string): DedupRecord | null {
      return rows.get(keyOf(userId, normalizeEventKey(eventKey))) ?? null;
    },
    clear() {
      rows.clear();
    },
  };
}
