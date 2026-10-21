"use client";

import { useCallback, type PointerEvent } from "react";
import { LANDING_REVEAL_CARDS } from "@/lib/marketing/landingCopy";

function setCardPoint(event: PointerEvent<HTMLElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
  el.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
}

export function LandingRevealCards() {
  const onMove = useCallback(setCardPoint, []);

  return (
    <section className="axe-launch-reveal relative px-5 py-8 md:py-12">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-3 md:items-start">
        {LANDING_REVEAL_CARDS.map((card, index) => (
          <article
            key={card.title}
            className={`axe-launch-reveal-card axe-launch-reveal-card--${index + 1}`}
            onPointerMove={onMove}
          >
            <div className="axe-launch-reveal-default">
              <div className="axe-launch-reveal-default-inner">
                <div className="axe-launch-reveal-orb">{card.orb}</div>
                <h2 className="text-[1.7rem] font-bold tracking-[-0.04em] text-white sm:text-[1.85rem]">
                  {card.title}
                </h2>
                <span>Hover to reveal</span>
              </div>
            </div>
            <div className="axe-launch-reveal-hover">
              <div className="axe-launch-reveal-hover-inner">
                <p className="axe-launch-reveal-kicker">{card.kicker}</p>
                <h3 className="text-2xl font-bold tracking-[-0.04em] text-white">{card.title}</h3>
                <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-white/55">{card.body}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
