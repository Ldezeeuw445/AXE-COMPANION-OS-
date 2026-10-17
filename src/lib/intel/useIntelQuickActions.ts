"use client";

import { useEffect, useState } from "react";
import { INTEL_QUICK_ACTIONS, type IntelQuickAction } from "@/lib/intel/intelQuickActions";

/**
 * Which intel quick actions are worth offering right now.
 *
 * "Market Tide" sat in the composer of every intel user while the feed behind
 * it (Unusual Whales) has never been subscribed. AXE answered honestly — "not
 * configured" — so it was not a lie, but it was a button whose only possible
 * outcome was a dead end. `requires` already named the feed; this is the
 * filter that finally reads it.
 *
 * Availability lives in `process.env` on the server, so the client has to ask.
 * One shared promise for the whole tab: two composers mount this, and the
 * answer does not change between them.
 */

type AvailabilityResponse = { actions?: Record<string, boolean> };

let cached: Promise<Record<string, boolean>> | null = null;

function fetchAvailability(): Promise<Record<string, boolean>> {
  cached ??= fetch("/api/intel-chat", { method: "GET" })
    .then((res) => (res.ok ? (res.json() as Promise<AvailabilityResponse>) : null))
    .then((json) => json?.actions ?? {})
    .catch(() => ({}));
  return cached;
}

/** Only for tests and for a hard refresh after an operator changes the env. */
export function resetIntelAvailabilityCache(): void {
  cached = null;
}

export function useIntelQuickActions(): readonly IntelQuickAction[] {
  // Start from the full list so the first paint matches the server's markup
  // and nothing jumps; the unavailable ones drop out a tick later.
  const [actions, setActions] = useState<readonly IntelQuickAction[]>(INTEL_QUICK_ACTIONS);

  useEffect(() => {
    let alive = true;
    void fetchAvailability().then((map) => {
      if (!alive) return;
      // An empty map means the call failed, not that everything is off.
      // Hiding every shortcut because one fetch timed out is worse than the
      // dead end this filter exists to remove.
      if (Object.keys(map).length === 0) return;
      setActions(INTEL_QUICK_ACTIONS.filter((q) => map[q.requires] !== false));
    });
    return () => {
      alive = false;
    };
  }, []);

  return actions;
}
