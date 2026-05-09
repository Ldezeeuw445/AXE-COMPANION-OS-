"use client";

import { useEffect } from "react";
import { setLiveStatus, clearLiveStatus } from "@/lib/liveStatusBus";

/**
 * Tiny client wrapper that lets server-rendered pages push their
 * computed live status into the global bus that drives the AXE
 * wordmark pulse in the mobile top bar.
 *
 * Pages render this with the numbers they already computed for their
 * own provider badges — `liveCount`, `totalCount`, optional `ageSec`
 * for freshness, and a `label` for the tooltip. The bus does the rest.
 *
 * On unmount the bus is reset so navigating to a page that doesn't
 * report (e.g. Settings) immediately drops the pulse to the dim
 * "no opinion" state instead of leaving the previous page's green
 * dot lit.
 */
export function LiveStatusReporter({
  liveCount,
  totalCount,
  freshestAgeSec = null,
  label,
  /** Override `allLive` when the page knows better than count math
   *  (e.g. cached/stale state where liveCount === totalCount but data
   *  isn't actually fresh). */
  allLiveOverride,
}: {
  liveCount: number;
  totalCount: number;
  freshestAgeSec?: number | null;
  label?: string;
  allLiveOverride?: boolean | null;
}) {
  useEffect(() => {
    const allLive =
      allLiveOverride !== undefined
        ? allLiveOverride
        : totalCount > 0
          ? liveCount === totalCount && liveCount > 0
          : null;
    setLiveStatus({
      allLive,
      liveCount,
      totalCount,
      freshestAgeSec,
      label,
    });
    return () => {
      clearLiveStatus();
    };
  }, [allLiveOverride, freshestAgeSec, label, liveCount, totalCount]);

  return null;
}
