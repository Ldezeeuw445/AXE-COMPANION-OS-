"use client";

import { useEffect, useState } from "react";

/**
 * Tracks document.visibilityState. Returns `true` when the tab is visible.
 * Used by the chart pipeline to disconnect the live stream while hidden so
 * mobile devices don't burn data/battery in the background.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    function onChange() {
      setVisible(document.visibilityState !== "hidden");
    }
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}
