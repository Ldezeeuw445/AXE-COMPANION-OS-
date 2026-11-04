"use client";

import { useCallback, useRef } from "react";

/**
 * Drie kaarten die A, X en E spellen en omklappen als je erover gaat.
 *
 * Uit Luka's final-landing-v2-enhanced.html. De voorkant is één letter en één
 * regel; de achterkant vertelt wat die letter betekent.
 *
 * Twee dingen die in zijn versie stilletjes misgaan en hier niet mogen:
 *
 * 1. **Op een telefoon bestaat hover niet.** Dan is de achterkant — waar de
 *    hele inhoud staat — onbereikbaar, en zie je drie kaarten met een letter
 *    erop en verder niets. Onder `(hover: none)` staat de achterkant daarom
 *    altijd open en is de voorkant weg. Dat staat in globals.css, niet hier,
 *    want het moet ook kloppen voordat dit bestand geladen is.
 * 2. **De tekst moet waar zijn.** De landingspagina wordt vastgehouden door
 *    verify-landing-claims; wat hier staat is terug te voeren op code die
 *    bestaat. Geen "continuously analyzes" over een cron die elk uur draait,
 *    en geen bronnen die niet betaald zijn. De drie teksten hieronder noemen
 *    alleen dingen die er echt zijn: de gratis bronnen uit INTEL_ACTION_SOURCE,
 *    de vijf grenzen van autoTradeGuard, en het geheugen dat er al is.
 */

type Kaart = {
  letter: string;
  voorkantTitel: string;
  belofte: string;
  woorden: readonly [string, string, string];
  tekst: string;
  /** De tweede kaart is paars in plaats van cyaan, zoals in Luka's bestand. */
  paars?: boolean;
};

const KAARTEN: readonly Kaart[] = [
  {
    letter: "A",
    voorkantTitel: "YOUR",
    belofte: "See more than the chart.",
    woorden: ["ANALYZE", "AWARE", "ADAPTIVE"],
    tekst:
      "AXE reads the chart alongside the things that move it: SEC EDGAR filings, world events from GDELT, correlations between the instruments you trade, and your own account — open positions, risk band and journal. What it learns about how you trade shapes the next answer.",
  },
  {
    letter: "X",
    voorkantTitel: "AI",
    belofte: "Turn insight into action.",
    woorden: ["EXECUTE", "EXPERT", "EXTEND"],
    paars: true,
    tekst:
      "Place an order on your own MT5 or Alpaca account in one tap. Before anything leaves, the guard checks five limits — news window, weekend, lot size, risk per trade and daily loss — and blocks with the rule named rather than quietly placing something smaller.",
  },
  {
    letter: "E",
    voorkantTitel: "COMPANION",
    belofte: "Built to grow alongside you.",
    woorden: ["EVOLVING", "ENGINE", "EMPOWERING"],
    tekst:
      "Closed trades feed your playbook edge, journal entries get scored, and the answers you rate plus the notes you save carry into the next conversation. The longer you use it, the more it argues from your own book instead of a generic playbook.",
  },
];

export function LandingRevealCards() {
  return (
    <section className="relative px-5 py-16 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
        {KAARTEN.map((kaart) => (
          <RevealKaart key={kaart.letter} kaart={kaart} />
        ))}
      </div>
    </section>
  );
}

function RevealKaart({ kaart }: { kaart: Kaart }) {
  const ref = useRef<HTMLElement>(null);

  // Zelfde reden als bij LandingGlowBand: een render per muisbeweging op drie
  // kaarten tegelijk is het soort traagheid dat niemand later terugvindt.
  const volg = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    el.style.setProperty("--card-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty("--card-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }, []);

  return (
    <article
      ref={ref}
      onPointerMove={volg}
      className={`axe-reveal-card ${kaart.paars ? "axe-reveal-card-paars" : ""}`}
    >
      <div className="axe-reveal-front">
        <div className="axe-reveal-front-inner">
          <div className="axe-reveal-orb" aria-hidden>
            {kaart.letter}
          </div>
          <h3 className="text-[29px] leading-[1.04] tracking-[-0.04em] text-white">{kaart.voorkantTitel}</h3>
          <span className="mt-2.5 block text-xs font-semibold uppercase tracking-[0.22em] text-white/36">
            {kaart.belofte}
          </span>
        </div>
      </div>

      <div className="axe-reveal-back">
        <div className="axe-reveal-back-inner">
          <div className="mb-3.5 flex items-start gap-3.5">
            <span className="axe-reveal-letter" aria-hidden>
              {kaart.letter}
            </span>
            <div className="flex flex-col gap-0.5">
              {kaart.woorden.map((woord) => (
                <span key={woord} className="text-[18px] font-extrabold tracking-[-0.02em] text-[#f5f7fb]">
                  {woord}
                  <span className="text-[#48def6]">.</span>
                </span>
              ))}
            </div>
          </div>
          <div className="axe-reveal-belofte mb-2.5">{kaart.belofte}</div>
          <p className="max-w-[38ch] text-[15px] leading-[1.72] text-white/52">{kaart.tekst}</p>
        </div>
      </div>
    </article>
  );
}
