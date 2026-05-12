"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { probeCloudMt5StatusAction } from "@/app/actions/mt5Cloud";

/**
 * Statuses that mean MetaApi hasn't reported the terminal as live yet.
 * Anything else (connected / disconnected / failed) is "settled" and
 * doesn't need polling.
 */
const TRANSIENT_STATUSES = new Set([
  "provisioning",
  "connecting",
  "created",
  "deploying",
  "undeployed",
]);

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 3 * 60_000;

export type ProvisioningTarget = {
  id: string;
  providerStatus: string | null;
};

/**
 * Headless component that auto-polls MetaApi provisioning status for any
 * account still spinning up. Stops as soon as every account has settled
 * (or after MAX_POLL_DURATION_MS — at that point the user can hit Test
 * manually). Calls `router.refresh()` only when a status actually flipped
 * so we don't thrash server rendering.
 *
 * Why this exists: cloud MT5 accounts can take 30-120s before the broker
 * terminal is fully deployed on MetaApi. Without polling, users see
 * "provisioning…" and either think the connect failed or click Test
 * repeatedly. This makes the connect flow feel premium-instant — the
 * pill turns green by itself.
 */
export function Mt5ProvisioningAutoPoll({ targets }: { targets: ProvisioningTarget[] }) {
  const router = useRouter();
  // 0 = "not started yet" — set on first effect run to keep render pure
  // (Date.now() is impure and tripping react-hooks/purity if called inline).
  const startedAtRef = useRef<number>(0);

  const transientIds = targets
    .filter((t) => (t.providerStatus ?? "").trim().length > 0)
    .filter((t) => TRANSIENT_STATUSES.has((t.providerStatus ?? "").toLowerCase()))
    .map((t) => t.id);

  const transientKey = transientIds.join("|");

  useEffect(() => {
    if (!transientKey) return;
    startedAtRef.current = Date.now();

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAtRef.current > MAX_POLL_DURATION_MS) {
        return;
      }

      let anyChanged = false;
      for (const id of transientKey.split("|")) {
        if (!id) continue;
        try {
          const result = await probeCloudMt5StatusAction(id);
          if (cancelled) return;
          if (result.ok && result.data && !TRANSIENT_STATUSES.has(result.data.providerStatus.toLowerCase())) {
            anyChanged = true;
          }
        } catch {
          // Probe failures are normal during the first few seconds —
          // keep polling silently.
        }
      }

      if (cancelled) return;
      if (anyChanged) {
        router.refresh();
      }
    };

    void tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [transientKey, router]);

  return null;
}
