import { useLayoutEffect, useRef, useState } from "react";

/**
 * Observe element size via ResizeObserver (layout effect so first treemap pass has real px).
 */
export function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.round(r.width));
      const h = Math.max(0, Math.round(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(update);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}
