"use client";

import { useCallback, useRef, type ReactNode } from "react";

/**
 * Een sectie met een cyaan gloed die de muis volgt.
 *
 * Uit Luka's final-landing-v2-enhanced.html, waar vier van deze banden de
 * pagina in stukken knippen. De gloed zelf staat in `.axe-glow-band` in
 * globals.css; deze component doet alleen het volgen.
 *
 * Twee dingen die het stil kapot maken:
 *
 * 1. De positie per muisbeweging in React-state zetten. Dat is een render per
 *    frame op een sectie die de halve pagina beslaat. Daarom gaat het via
 *    `style.setProperty` op het element zelf — de browser hertekent dan alleen
 *    de gradient, en React weet er niets van.
 * 2. `getBoundingClientRect()` bij elke beweging aanroepen. Dat dwingt layout
 *    af, ook als er niets veranderd is. De rect wordt per beweging één keer
 *    gelezen en daarna direct gebruikt.
 *
 * Zonder JS (of voordat dit laadt) staat de gloed in het midden: `--glow-x` en
 * `--glow-y` hebben een standaardwaarde in de CSS. De band is dan nog steeds
 * een band, alleen niet interactief.
 */
export function LandingGlowBand({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  const ref = useRef<HTMLElement>(null);

  const volg = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    el.style.setProperty("--glow-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty("--glow-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }, []);

  // Terug naar het midden als de muis weg is, anders blijft de gloed hangen op
  // de laatste plek waar iemand toevallig was.
  const herstel = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--glow-x", "50%");
    el.style.setProperty("--glow-y", "50%");
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`axe-glow-band ${className}`}
      onPointerMove={volg}
      onPointerLeave={herstel}
    >
      {children}
    </Tag>
  );
}
