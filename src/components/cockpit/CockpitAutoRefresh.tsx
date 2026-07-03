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
    <div className="tos-matte-banner justify-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em]">
      <span
        className={`tos-accent-dot shrink-0 ${
          status === "running"
            ? "tos-accent-dot--cyan animate-pulse"
            : status === "done"
              ? "tos-accent-dot--emerald"
              : "tos-accent-dot--amber"
        }`}
        aria-hidden
      />
      <span className="text-white/78">
        {status === "running" && "Recalibrating — new signals detected"}
        {status === "done" && "Recalibrated"}
        {status === "error" && (errorMessage ?? "Recalibration skipped — will retry later")}
      </span>
    </div>
  );
}
