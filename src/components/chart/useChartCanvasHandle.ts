"use client";

import { useEffect, useState, type RefObject } from "react";
import type { ChartCanvasHandle } from "@/components/chart/ChartCanvas";

/**
 * Snapshot of the chart canvas handle for overlay geometry.
 *
 * Overlays used to read `canvasRef.current` during render / useMemo, which
 * the React 19 hooks compiler flags. The handle is captured after paint and
 * refreshed on viewport events so coordinate conversion stays in sync.
 */
export function useChartCanvasHandle(
  canvasRef: RefObject<ChartCanvasHandle | null>,
): ChartCanvasHandle | null {
  const [handle, setHandle] = useState<ChartCanvasHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let unsub: (() => void) | undefined;

    const attach = () => {
      if (cancelled) return;
      const next = canvasRef.current;
      if (!next) {
        raf = requestAnimationFrame(attach);
        return;
      }
      setHandle(next);
      unsub = next.subscribeViewport(() => {
        setHandle(canvasRef.current);
      });
    };

    raf = requestAnimationFrame(attach);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      unsub?.();
    };
  }, [canvasRef]);

  return handle;
}
