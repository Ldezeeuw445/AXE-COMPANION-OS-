"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Fixed chat composer stack pinned above bottom nav.
 * Orb is rendered separately via ChatComposerOrb (portaled, anchor-synced).
 */
export function ChatComposerDock({ children }: Props) {
  const dockBottom = "calc(var(--tos-nav-h) + env(safe-area-inset-bottom, 0px) + 0.2rem)";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] overflow-visible px-3 md:static md:inset-auto md:bottom-auto md:z-auto md:overflow-visible md:px-0 md:pb-0"
      style={{ bottom: dockBottom }}
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-2xl overflow-visible">
        {children}
      </div>
    </div>
  );
}
