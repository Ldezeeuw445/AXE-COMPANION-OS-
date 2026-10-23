"use client";

import type { Freshness } from "@/lib/pwa/staleAge";

type Props = {
  freshness: Freshness;
  /** Force the badge even when freshness is live (account last-sync). */
  always?: boolean;
  className?: string;
  testId?: string;
};

const TONE: Record<Freshness["kind"], string> = {
  live: "border-white/10 bg-white/[0.04] text-white/45",
  stale: "border-amber-400/30 bg-amber-400/10 text-amber-200/90",
  offline: "border-amber-400/35 bg-amber-400/12 text-amber-100",
};

/**
 * Visible age mark so a cached quote, candle, or account figure cannot pass
 * as a live tick. Hidden only when the payload is live and `always` is false.
 */
export function StaleAgeBadge({ freshness, always = false, className = "", testId }: Props) {
  if (!freshness.badge) return null;
  if (!always && !freshness.stale) return null;

  return (
    <span
      data-testid={testId ?? "stale-age-badge"}
      data-freshness={freshness.kind}
      title={freshness.title}
      className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${TONE[freshness.kind]} ${className}`}
    >
      {freshness.badge}
    </span>
  );
}
