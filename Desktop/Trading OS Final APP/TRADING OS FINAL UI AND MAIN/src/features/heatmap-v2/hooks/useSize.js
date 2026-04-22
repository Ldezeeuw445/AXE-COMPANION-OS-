import { useEffect, useRef, useState } from "react";

/**
 * Observe element size via ResizeObserver.
 * Falls back to getBoundingClientRect on mount.
 */
export function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}
