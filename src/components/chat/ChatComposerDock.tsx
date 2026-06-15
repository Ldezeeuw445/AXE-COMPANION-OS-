"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Fixed chat composer stack pinned above bottom nav (portaled to body).
 * Orb is rendered inside Composer, anchored to the input bar top edge.
 */
export function ChatComposerDock({ children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dockBottom = "calc(var(--tos-nav-h) + env(safe-area-inset-bottom, 0px) + 0.2rem)";

  const stack = (
    <div
      className="pointer-events-none fixed inset-x-0 z-[85] px-3 max-md:block md:hidden"
      style={{ bottom: dockBottom }}
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-2xl overflow-visible">
        {children}
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") {
    return stack;
  }

  return createPortal(stack, document.body);
}
