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
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * Reserve exactly the height the composer actually has.
   *
   * --tos-chat-composer-h used to be a hand-written guess, and every change to
   * the composer made it wrong in one direction or the other: too small hid
   * the newest message behind the card, too large left a dead gap the trader
   * had to scroll past. Measuring it means the list always ends right above
   * the composer, and the thread re-pins whenever the height changes (a
   * growing textarea, an attached image).
   */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h <= 0) return;
      document.documentElement.style.setProperty("--tos-chat-composer-h", `${h}px`);
      window.dispatchEvent(new CustomEvent("axe:composer-resize"));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--tos-chat-composer-h");
    };
  }, [mounted]);

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
    <>
      {/* Covers the thread from the composer's top edge down, so nothing is
          seen travelling through the gap above the nav or behind the pill.
          Deliberately outside the transform below: when the keyboard pushes
          the composer up it is covering that band itself, and a scrim that
          rode along would leave a bare strip behind it. */}
      <div
        className="tos-chat-bottom-scrim pointer-events-none fixed inset-x-0 bottom-0 z-[50]"
        aria-hidden
      />
      <div
        className="tos-chat-composer-dock pointer-events-none fixed inset-x-0 z-[85] block px-3"
        style={{
          bottom: dockBottom,
          transform: `translate3d(0, -${keyboardInset}px, 0)`,
          willChange: keyboardInset > 0 ? "transform" : undefined,
        }}
      >
        <div ref={cardRef} className="pointer-events-auto relative mx-auto w-full max-w-2xl overflow-visible">
          {children}
        </div>
      </div>
    </>
  );

  if (!mounted || typeof document === "undefined") {
    return stack;
  }

  return createPortal(stack, document.body);
}
