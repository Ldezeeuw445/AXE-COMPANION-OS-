"use client";

import { useEffect, useState } from "react";
import { AxeWordmark } from "@/components/brand/AxeWordmark";
import {
  getLiveStatus,
  subscribeLiveStatus,
  type LiveStatus,
} from "@/lib/liveStatusBus";

/**
 * AxeWordmarkLive
 *
 * Sits in the centre of the mobile top bar. The pulsing dot to the LEFT
 * of the wordmark is the single, honest "is this page actually live?"
 * indicator for the whole app:
 *
 *   • green pulsing — core runtime reported fresh/connected
 *   • amber static  — runtime is partial, warming, degraded, or stale
 *   • dim grey      — no runtime claim on this page (no opinion)
 *
 * Pages push their state via `setLiveStatus(...)` from
 * `@/lib/liveStatusBus`. Pages with no live concept (Settings, Vault,
 * Watchlist as a static list, …) can skip reporting — the dim dot is
 * the truthful default.
 */
export function AxeWordmarkLive({
  size = "xs",
  className = "",
}: {
  size?: "xs" | "sm";
  className?: string;
}) {
  const [status, setStatus] = useState<LiveStatus>(() => getLiveStatus());

  useEffect(() => subscribeLiveStatus(setStatus), []);

  const tone =
    status.severity === "blocking"
      ? "red"
      : status.severity === "inactive"
        ? "idle"
        : status.severity === "degraded"
          ? "amber"
          : status.severity === "fresh" || status.allLive === true
      ? "green"
      : status.allLive === false
        ? "amber"
        : "idle";

  const dotClass =
    tone === "green"
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
      : tone === "red"
        ? "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]"
      : tone === "amber"
        ? "bg-amber-300/85"
        : "bg-white/22";

  const titleParts: string[] = [];
  if (status.label) titleParts.push(status.label);
  if (status.reason) titleParts.push(status.reason);
  if (status.totalCount > 0) {
    titleParts.push(`${status.liveCount}/${status.totalCount} runtime checks fresh`);
  }
  if (status.freshestAgeSec != null) {
    titleParts.push(`refreshed ${status.freshestAgeSec}s ago`);
  }
  if (titleParts.length === 0) {
    titleParts.push("AXE — no runtime claim on this page");
  }
  const title = titleParts.join(" · ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 select-none ${className}`}
      title={title}
      aria-label={title}
    >
      <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
        {tone === "green" || tone === "red" ? (
          <span
            className={`absolute inset-0 rounded-full animate-ping ${tone === "red" ? "bg-rose-400/70" : "bg-emerald-400/70"}`}
            aria-hidden
          />
        ) : null}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotClass}`}
          aria-hidden
        />
      </span>
      <AxeWordmark size={size} />
    </span>
  );
}
