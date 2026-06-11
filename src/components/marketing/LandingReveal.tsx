"use client";

/**
 * LandingReveal
 *
 * Lightweight scroll-reveal wrapper for the marketing page. Adds the
 * `.axe-reveal` class (opacity 0 + translateY) and toggles `.is-visible`
 * via IntersectionObserver the first time the element enters the viewport.
 * Respects prefers-reduced-motion through the CSS (animation disabled there).
 */

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

export function LandingReveal({
  children,
  as: Tag = "div",
  delayMs = 0,
  className = "",
}: {
  children: ReactNode;
  as?: ElementType;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`axe-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
