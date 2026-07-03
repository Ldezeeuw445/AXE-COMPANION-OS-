"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

type Props = {
  children: ReactNode;
};

function readKeyboardInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const raw = window.innerHeight - vv.height - vv.offsetTop;
  const rounded = Number.isFinite(raw) ? Math.round(raw) : 0;
  return Math.max(0, Math.min(420, rounded));
}

/**
 * Fixed chat composer stack pinned above bottom nav (portaled to body).
 * Shifts up with the on-screen keyboard via visualViewport.
 */
export function ChatComposerDock({ children }: Props) {
  const [mounted, setMounted] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const rafRef = useRef<number | null>(null);
  const insetRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function sync() {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        const next = readKeyboardInset();
        if (Math.abs(next - insetRef.current) < 2) return;
        insetRef.current = next;
        setKeyboardInset(next);
      });
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
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const dockBottom = "var(--tos-chat-composer-bottom, var(--tos-nav-h))";

  const stack = (
    <div
      className="tos-chat-composer-dock pointer-events-none fixed inset-x-0 z-[85] block px-3"
      style={{
        bottom: dockBottom,
        transform: `translate3d(0, -${keyboardInset}px, 0)`,
        willChange: keyboardInset > 0 ? "transform" : undefined,
      }}
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
