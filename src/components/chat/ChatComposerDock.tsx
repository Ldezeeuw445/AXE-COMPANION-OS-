"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AxeAuraWave } from "@/components/ui/AxeAuraWave";

type Props = {
  children: ReactNode;
};

/**
 * Fixed chat composer stack: input bar pinned above bottom nav,
 * particle dome half-emerging from the top edge of the bar.
 *
 * Orb sits in the same fixed stack as the composer (not a separate portal)
 * so positioning stays locked to the bar across nav heights and safe areas.
 */
export function ChatComposerDock({ children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dockBottom = "calc(var(--tos-nav-h) + env(safe-area-inset-bottom, 0px) + 0.2rem)";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] px-3 md:static md:inset-auto md:bottom-auto md:z-auto md:px-0 md:pb-0"
      style={{ bottom: dockBottom }}
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-2xl overflow-visible">
        {mounted ? (
          <div
            className="pointer-events-none absolute left-1/2 z-[2] flex -translate-x-1/2 justify-center md:hidden"
            style={{
              bottom: "calc(100% - 0.35rem)",
              width: "min(100vw, 20rem)",
            }}
            aria-hidden
          >
            <AxeAuraWave variant="composer" />
          </div>
        ) : null}
        <div className="relative z-[1]">{children}</div>
      </div>
    </div>
  );
}
