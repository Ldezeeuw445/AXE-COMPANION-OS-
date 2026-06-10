"use client";

/**
 * SwipeContentWrapper — detects horizontal swipe gestures on
 * content pages and navigates between tabs (like Slack).
 *
 * Disabled on chart page (has its own pan/drag gestures).
 * Reports swipe progress to SwipeNavContext so the navbar
 * can animate a glass bubble.
 */

import { useRef, useCallback, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAmbient } from "@/components/ambient/AmbientProvider";
import { useSwipeNav } from "./SwipeNavContext";

const TAB_ORDER = ["/chat", "/watchlist", "/chart", "/positions", "/history", "/settings"];
const CHART_PATH = "/chart";
const SWIPE_THRESHOLD = 60;   // px to commit navigation
const DEAD_ZONE = 12;         // px before recognising direction

export function SwipeContentWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { playSound, vibrate } = useAmbient();
  const { setProgress, setCurrentTabIdx } = useSwipeNav();

  const touchRef = useRef<{
    startX: number;
    startY: number;
    locked: "horizontal" | "vertical" | null;
    currentIdx: number;
  } | null>(null);
  const navigatedRef = useRef(false);

  // Find current tab index
  const currentIdx = TAB_ORDER.findIndex(
    (t) => pathname === t || pathname.startsWith(`${t}/`)
  );

  const isChartPage = pathname === CHART_PATH || pathname.startsWith(`${CHART_PATH}/`);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isChartPage) return;
    const touch = e.touches[0];
    if (!touch) return;

    const idx = currentIdx >= 0 ? currentIdx : 0;
    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      locked: null,
      currentIdx: idx,
    };
    navigatedRef.current = false;
    setCurrentTabIdx(idx);
  }, [isChartPage, currentIdx, setCurrentTabIdx]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = touchRef.current;
    if (!t) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - t.startX;
    const dy = touch.clientY - t.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Lock direction after dead zone
    if (!t.locked) {
      if (absDx + absDy < DEAD_ZONE) return;
      if (absDy > absDx) {
        t.locked = "vertical";
        return;
      }
      t.locked = "horizontal";
    }
    if (t.locked !== "horizontal") return;

    // Calculate progress: positive = swiping left (next), negative = swiping right (prev)
    const progress = Math.max(-1, Math.min(1, -dx / (SWIPE_THRESHOLD * 2)));

    // Check boundaries — don't show progress if there's no tab in that direction
    const canGoPrev = t.currentIdx > 0;
    const canGoNext = t.currentIdx < TAB_ORDER.length - 1;

    if (progress < 0 && !canGoPrev) {
      setProgress(0);
      return;
    }
    if (progress > 0 && !canGoNext) {
      setProgress(0);
      return;
    }

    setProgress(progress);
  }, [setProgress]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const t = touchRef.current;
    if (!t || t.locked !== "horizontal" || navigatedRef.current) {
      touchRef.current = null;
      setProgress(0);
      return;
    }

    const touch = e.changedTouches[0];
    if (!touch) {
      touchRef.current = null;
      setProgress(0);
      return;
    }

    const dx = touch.clientX - t.startX;

    // Determine direction: positive dx = swipe right = prev tab, negative dx = swipe left = next tab
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      let targetIdx: number;
      if (dx > 0) {
        // Swipe right → previous tab
        targetIdx = t.currentIdx - 1;
      } else {
        // Swipe left → next tab
        targetIdx = t.currentIdx + 1;
      }

      // Skip chart page when swiping through tabs
      if (TAB_ORDER[targetIdx] === CHART_PATH) {
        targetIdx += dx > 0 ? -1 : 1;
      }

      if (targetIdx >= 0 && targetIdx < TAB_ORDER.length) {
        navigatedRef.current = true;
        vibrate("light");
        playSound("tap");
        router.push(TAB_ORDER[targetIdx]);
      }
    }

    touchRef.current = null;
    setProgress(0);
  }, [router, vibrate, playSound, setProgress]);

  const onTouchCancel = useCallback(() => {
    touchRef.current = null;
    setProgress(0);
  }, [setProgress]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      style={{ touchAction: isChartPage ? "auto" : "pan-y" }}
    >
      {children}
    </div>
  );
}
