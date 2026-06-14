"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { AxeAuraWave } from "@/components/ui/AxeAuraWave";

type Props = {
  children: ReactNode;
};

/**
 * Fixed chat composer stack: input bar pinned above bottom nav,
 * particle dome half-emerging from the top edge of the bar.
 *
 * Orb is portaled to document.body so overflow:hidden ancestors cannot clip it.
 */
export function ChatComposerDock({ children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dockBottom = "calc(var(--tos-nav-h) + env(safe-area-inset-bottom, 0px) + 0.2rem)";
  const orbBottom = "calc(var(--tos-nav-h) + env(safe-area-inset-bottom, 0px) + 3.35rem)";

  const orb =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 z-[55] flex justify-center md:hidden"
            style={{ bottom: orbBottom }}
            aria-hidden
          >
            <AxeAuraWave variant="composer" />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {orb}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 px-3 md:static md:inset-auto md:bottom-auto md:z-auto md:px-0 md:pb-0"
        style={{ bottom: dockBottom }}
      >
        <div className="pointer-events-auto relative mx-auto w-full max-w-2xl overflow-visible">
          <div className="relative z-10">{children}</div>
        </div>
      </div>
    </>
  );
}
