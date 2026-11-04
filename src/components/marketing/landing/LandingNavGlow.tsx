"use client";

import { useCallback, useRef, type ReactNode } from "react";

/**
 * De navigatiebalk met een gloed die onder je cursor meeloopt.
 *
 * Uit Luka's final-landing-v2-enhanced.html. De gloed zelf staat in
 * `.axe-nav-glow` in globals.css; dit doet het volgen en het aan/uit zetten.
 *
 * Waarom de gloed in een eigen `<div>` zit en niet op de header: zijn versie
 * zet `overflow: hidden` op de nav, en dat knipt het paneel van de
 * AppSwitcher weg, dat op desktop ónder de header uitklapt.
 *
 * De positie gaat via `style.setProperty` op het element in plaats van via
 * state. Een render per muisbeweging op een sticky balk die op elke scroll
 * al opnieuw wordt getekend, is het soort traagheid waar niemand later de
 * oorzaak van terugvindt.
 */
export function LandingNavGlow({ children, className = "" }: { children: ReactNode; className?: string }) {
  const headerRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  const volg = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const header = headerRef.current;
    const glow = glowRef.current;
    if (!header || !glow) return;
    const rect = header.getBoundingClientRect();
    if (rect.width === 0) return;
    glow.style.setProperty("--nav-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    glow.classList.add("axe-nav-glow-active");
  }, []);

  const uit = useCallback(() => {
    glowRef.current?.classList.remove("axe-nav-glow-active");
  }, []);

  return (
    <header ref={headerRef} className={className} onPointerMove={volg} onPointerLeave={uit}>
      <div ref={glowRef} className="axe-nav-glow" aria-hidden />
      {children}
    </header>
  );
}
