"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type Props = {
  children: ReactNode;
};

function readKeyboardInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/**
 * Fixed chat composer stack pinned above bottom nav (portaled to body).
 * Shifts up with the on-screen keyboard via visualViewport.
 */
export function ChatComposerDock({ children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function sync() {
      setKeyboardInset(readKeyboardInset());
    }

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("focusin", sync);
    window.addEventListener("focusout", sync);

    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("focusin", sync);
      window.removeEventListener("focusout", sync);
    };
  }, []);

  const dockBottom = `calc(var(--tos-nav-h) + env(safe-area-inset-bottom, 0px) + 0.2rem + ${keyboardInset}px)`;

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
