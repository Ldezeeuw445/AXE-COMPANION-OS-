"use client";

import type { ReactNode } from "react";
import { AxeAuraWave } from "@/components/ui/AxeAuraWave";

type Props = {
  children: ReactNode;
};

/**
 * Fixed chat composer stack: input bar pinned above bottom nav,
 * particle dome half-emerging from the top edge of the bar.
 */
export function ChatComposerDock({ children }: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 px-3 md:static md:inset-auto md:bottom-auto md:z-auto md:px-0 md:pb-0"
      style={{ bottom: "calc(var(--tos-nav-h) + env(safe-area-inset-bottom, 0px) + 0.2rem)" }}
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-2xl">
        {/* Dome sits on the composer rim — translateY pulls the lower half into the bar */}
        <div
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
          style={{ bottom: "100%", transform: "translateX(-50%) translateY(42px)" }}
        >
          <AxeAuraWave variant="composer" />
        </div>
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}
