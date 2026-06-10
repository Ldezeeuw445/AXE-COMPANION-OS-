"use client";

/**
 * SwipeNavContext — shared state between content swipe gestures
 * and the bottom navbar's glass bubble indicator.
 *
 * `swipeProgress` is a number from -1 to +1:
 *   - 0 = no swipe / resting
 *   - negative = swiping toward the previous tab (finger moves right)
 *   - positive = swiping toward the next tab (finger moves left)
 *
 * The navbar reads this to animate a glass bubble between tabs.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SwipeNavState {
  /** -1 … +1 swipe progress (0 = resting) */
  progress: number;
  /** Index of current tab (used by navbar to calculate bubble position) */
  currentTabIdx: number;
  setProgress: (p: number) => void;
  setCurrentTabIdx: (idx: number) => void;
}

const SwipeNavCtx = createContext<SwipeNavState>({
  progress: 0,
  currentTabIdx: 0,
  setProgress: () => {},
  setCurrentTabIdx: () => {},
});

export function SwipeNavProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [currentTabIdx, setCurrentTabIdx] = useState(0);

  return (
    <SwipeNavCtx.Provider value={{ progress, currentTabIdx, setProgress, setCurrentTabIdx }}>
      {children}
    </SwipeNavCtx.Provider>
  );
}

export function useSwipeNav() {
  return useContext(SwipeNavCtx);
}
