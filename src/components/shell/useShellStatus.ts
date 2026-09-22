"use client";

import { useEffect, useState } from "react";
import type { ShellStatus } from "@/app/api/shell/status/route";

/**
 * Account state for the bottom nav, polled from one endpoint.
 *
 * Refreshes on a slow interval and immediately when the app comes back to the
 * foreground — a phone that was in a pocket for an hour would otherwise show
 * the state it had when it went in, which for a live-data indicator is worse
 * than showing nothing.
 */

const POLL_MS = 45_000;

const UNKNOWN: ShellStatus = { runtime: "inactive", positions: null, alertsTriggered: 0 };

export function useShellStatus(): ShellStatus {
  const [status, setStatus] = useState<ShellStatus>(UNKNOWN);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/shell/status", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setStatus(UNKNOWN);
          return;
        }
        const json = (await res.json()) as ShellStatus;
        if (!cancelled) setStatus(json);
      } catch {
        if (!cancelled) setStatus(UNKNOWN);
      }
    }

    void refresh();
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return status;
}
