"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { AxeAuraWave } from "@/components/ui/AxeAuraWave";

type Props = {
  children: ReactNode;
};

/**
 * Chat composer + particle orb, portaled to document.body so no ancestor
 * can clip the dome. Orb sits in the same fixed column as the input bar.
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
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center overflow-visible">
        <div className="pointer-events-none relative z-0 -mb-[5.25rem] flex w-full justify-center">
          <AxeAuraWave variant="composer" />
        </div>
        <div className="pointer-events-auto relative z-10 w-full">{children}</div>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") {
    return stack;
  }

  return createPortal(stack, document.body);
}
