"use client";

/**
 * SwipePageWrapper — wraps the main content area with:
 *   1. Horizontal-swipe detection for tab-to-tab navigation
 *   2. Directional slide-in animation when arriving via swipe
 *
 * Reads the swipe direction from sessionStorage on mount and applies
 * the correct CSS animation class (slide from left or right).
 * The animation plays once and then the class is removed.
 */

import { useEffect, useRef, type ReactNode } from "react";
import {
  useSwipeNavigation,
  consumeSwipeDirection,
} from "@/hooks/useSwipeNavigation";
import { usePathname } from "next/navigation";

export function SwipePageWrapper({ children }: { children: ReactNode }) {
  const { swipeProps } = useSwipeNavigation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  /* On every route change, check if we arrived via swipe and animate. */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const dir = consumeSwipeDirection();
    if (!dir) return;

    // dir = "left" means user swiped left → going to next tab → page enters from right
    // dir = "right" means user swiped right → going to prev tab → page enters from left
    const cls = dir === "left" ? "tos-slide-from-right" : "tos-slide-from-left";
    el.classList.add(cls);

    const cleanup = () => el.classList.remove(cls);
    el.addEventListener("animationend", cleanup, { once: true });

    // Safety fallback — remove class after 400ms if animationend doesn't fire
    const timer = setTimeout(cleanup, 400);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("animationend", cleanup);
      el.classList.remove("tos-slide-from-left", "tos-slide-from-right");
    };
  }, [pathname]);

  return (
    <div
      ref={wrapperRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      {...swipeProps}
    >
      {children}
    </div>
  );
}
