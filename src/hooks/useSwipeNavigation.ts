"use client";

/**
 * useSwipeNavigation — horizontal swipe detection for tab-to-tab
 * navigation in the AXE Companion mobile shell.
 *
 * Detects definitive horizontal swipes (distance > threshold, angle
 * < 35° from horizontal) and triggers a route change to the adjacent
 * tab. Stores swipe direction in sessionStorage so the target page
 * can animate in from the correct side.
 *
 * Disabled on the chart page — the chart canvas owns all horizontal
 * gestures for panning/zooming. On non-chart pages, swipe fires only
 * when the initial touchmove is clearly horizontal (locks intent
 * within the first 10 px of movement).
 */

import { useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/* ── Tab routing order ─────────────────────────────────────────── */
const TAB_ORDER = ["/chat", "/watchlist", "/chart", "/positions", "/history"];

/** Pages where swipe-away is disabled (chart owns horizontal gestures). */
const SWIPE_DISABLED_PATHS = ["/chart"];

const MIN_SWIPE_DISTANCE = 55; // px — definitive, no accidental triggers
const MAX_VERTICAL_RATIO = 0.7; // dy/dx must be below this (≈ 35°)

type SwipeDir = "left" | "right";

export function useSwipeNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  /* --- Refs for zero-allocation tracking during touch --- */
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  /** Once set, locks the axis for this gesture. */
  const intentRef = useRef<"horizontal" | "vertical" | null>(null);
  const navigatedRef = useRef(false);

  /* --- Derived from pathname --- */
  const isDisabled = SWIPE_DISABLED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  const currentIndex = TAB_ORDER.findIndex(
    (t) => pathname === t || pathname.startsWith(`${t}/`),
  );

  /* --- Handlers --- */
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isDisabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      startRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
      intentRef.current = null;
      navigatedRef.current = false;
    },
    [isDisabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isDisabled || !startRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      // Lock intent on first meaningful movement
      if (intentRef.current === null) {
        const dx = Math.abs(touch.clientX - startRef.current.x);
        const dy = Math.abs(touch.clientY - startRef.current.y);
        if (dx + dy < 10) return; // not enough movement yet
        intentRef.current = dx >= dy ? "horizontal" : "vertical";
      }

      // Once locked vertical, bail — let scrolling happen
      if (intentRef.current === "vertical") return;

      // For horizontal intent — we could prevent default to stop the
      // browser's own back-swipe / pull-to-refresh, but that requires
      // a non-passive listener. We skip that for now and just track.
    },
    [isDisabled],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (isDisabled || !startRef.current || navigatedRef.current) return;
      if (intentRef.current !== "horizontal") {
        startRef.current = null;
        return;
      }

      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startRef.current.x;
      const dy = Math.abs(touch.clientY - startRef.current.y);
      const absDx = Math.abs(dx);
      const elapsed = Date.now() - startRef.current.t;

      startRef.current = null;
      intentRef.current = null;

      // Must be a clear horizontal swipe
      if (absDx < MIN_SWIPE_DISTANCE) return;
      if (dy > absDx * MAX_VERTICAL_RATIO) return;
      // Ignore very slow drags (> 800 ms) — likely intentional pan
      if (elapsed > 800) return;

      const dir: SwipeDir = dx > 0 ? "right" : "left";
      const targetIndex =
        dir === "right" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= TAB_ORDER.length) return;
      if (currentIndex < 0) return; // not on a known tab

      navigatedRef.current = true;

      // Store direction for CSS animation on the target page
      try {
        sessionStorage.setItem("tos-swipe-dir", dir);
      } catch {
        /* SSR or quota — non-critical */
      }

      router.push(TAB_ORDER[targetIndex]);
    },
    [isDisabled, currentIndex, router],
  );

  const onTouchCancel = useCallback(() => {
    startRef.current = null;
    intentRef.current = null;
  }, []);

  return {
    swipeProps: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
    },
  };
}

/* ── Direction reader for animations ────────────────────────────── */

/**
 * Read and clear the swipe direction stored by the last navigation.
 * Call once on mount to get the animation class, then it auto-clears.
 */
export function consumeSwipeDirection(): SwipeDir | null {
  try {
    const dir = sessionStorage.getItem("tos-swipe-dir") as SwipeDir | null;
    if (dir) sessionStorage.removeItem("tos-swipe-dir");
    return dir;
  } catch {
    return null;
  }
}
