"use client";

/**
 * CockpitAutoRefresh — automatically recalibrates in the background
 * when the server detects new signals since the last snapshot.
 *
 * Shows a subtle "Recalibrating…" strip while working.
 * Refreshes the page when the new snapshot is saved.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function CockpitAutoRefresh({ shouldRefresh }: { shouldRefresh: boolean }) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!shouldRefresh || status !== "idle") return;

    let cancelled = false;

    async function run() {
      setStatus("running");
      try {
        const res = await fetch("/api/cockpit/generate", { method: "POST" });
        if (cancelled) return;
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!cancelled && res.ok && json.ok) {
          setStatus("done");
          setTimeout(() => {
            if (!cancelled) router.refresh();
          }, 900);
        } else {
          setStatus("error");
          setErrorMessage(json.error ?? "Recalibration failed");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRefresh]);

  if (status === "idle") return null;

  return (
    <div
      className={`flex items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors ${
        status === "running"
          ? "border border-cyan-400/10 bg-cyan-400/[0.04] text-cyan-300/70"
          : status === "done"
            ? "border border-emerald-400/10 bg-emerald-400/[0.04] text-emerald-300/70"
            : "border border-white/[0.06] bg-white/[0.02] text-tos-dim"
      }`}
    >
      {status === "running" && (
        <>
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400/50" />
          Recalibrating — new signals detected
        </>
      )}
      {status === "done" && (
        <>
          <span className="text-emerald-400">✓</span>
          Recalibrated
        </>
      )}
      {status === "error" && (
        <span>{errorMessage ?? "Recalibration skipped — will retry later"}</span>
      )}
    </div>
  );
}
