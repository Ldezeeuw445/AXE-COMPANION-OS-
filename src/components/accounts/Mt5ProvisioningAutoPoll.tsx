"use client";

import { useEffect, useRef, useState } from "react";
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
  const [expired, setExpired] = useState(false);
  const [manualRetrying, setManualRetrying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  // 0 = "not started yet" — set on first effect run to keep render pure
  // (Date.now() is impure and tripping react-hooks/purity if called inline).
  const startedAtRef = useRef<number>(0);

  const transientIds = targets
    .filter((t) => (t.providerStatus ?? "").trim().length > 0)
    .filter((t) => TRANSIENT_STATUSES.has((t.providerStatus ?? "").toLowerCase()))
    .map((t) => t.id);

  const transientKey = transientIds.join("|");

  useEffect(() => {
    if (!transientKey) {
      setExpired(false);
      setElapsedSec(0);
      return;
    }
    startedAtRef.current = Date.now();
    setExpired(false);
    setElapsedSec(0);

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedSec(Math.round(elapsed / 1000));
      if (elapsed > MAX_POLL_DURATION_MS) {
        setExpired(true);
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

  async function retryNow() {
    if (!transientKey || manualRetrying) return;
    setManualRetrying(true);
    setExpired(false);
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    try {
      await Promise.allSettled(
        transientKey
          .split("|")
          .filter(Boolean)
          .map((id) => probeCloudMt5StatusAction(id)),
      );
      router.refresh();
    } finally {
      setManualRetrying(false);
    }
  }

  if (!transientKey) return null;

  const elapsedLabel = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  if (!expired) {
    return (
      <div className="rounded-2xl border border-cyan-400/18 bg-cyan-400/[0.05] px-4 py-3 text-[12px] leading-relaxed text-cyan-100/90">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.7)]" aria-hidden />
              <p className="font-semibold text-cyan-50">MT5 cloud terminal is provisioning.</p>
            </div>
            <p className="mt-1 text-cyan-100/70">
              Checking MetaApi status every 5 seconds · {elapsedLabel} elapsed. The page remains usable while this settles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void retryNow()}
            disabled={manualRetrying}
            className="shrink-0 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-[11px] font-semibold text-cyan-50 hover:bg-cyan-300/18 disabled:opacity-50"
          >
            {manualRetrying ? "Checking…" : "Check now"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[12px] leading-relaxed text-amber-100/90">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-amber-50">MT5 provisioning is still pending.</p>
          <p className="mt-1 text-amber-100/75">
            MetaApi has not reported the terminal live after 3 minutes. AXE stopped auto-polling so the page stays responsive.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void retryNow()}
          disabled={manualRetrying}
          className="shrink-0 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] font-semibold text-amber-50 hover:bg-amber-300/18 disabled:opacity-50"
        >
          {manualRetrying ? "Checking…" : "Retry status"}
        </button>
      </div>
    </div>
  );
}
