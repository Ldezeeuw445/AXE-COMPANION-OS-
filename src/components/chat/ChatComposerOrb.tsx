"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { AxeAuraWave } from "@/components/ui/AxeAuraWave";

type Props = {
  anchorRef: RefObject<HTMLElement | null>;
};

/**
 * Portaled composer orb — tracks the input bar top edge via getBoundingClientRect
 * so iOS PWA / overflow ancestors cannot clip the particle dome.
 */
export function ChatComposerOrb({ anchorRef }: Props) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setPos({
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [anchorRef, mounted]);

  if (!mounted || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] md:hidden"
      style={{
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -56%)",
      }}
      aria-hidden
    >
      <AxeAuraWave variant="composer" />
    </div>,
    document.body,
  );
}
