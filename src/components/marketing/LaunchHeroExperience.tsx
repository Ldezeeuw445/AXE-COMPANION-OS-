"use client";

import { useState } from "react";
import { LandingHeroDevices } from "@/components/marketing/LandingHeroDevices";
import { LANDING_HERO, LANDING_RAIL } from "@/lib/marketing/landingCopy";

/**
 * Companion launch hero.
 *
 * Copy comes from the original LaunchHeroExperience ("AXE Companion. The
 * trader's phone OS."). The iPhone + iPad plate is LandingHeroDevices from
 * commit 12e8779 — the no-login mock, not /demo/embed. Hover lights the cyan
 * dot grid around the plate (same move as the Trading OS companion hero).
 */
export function LaunchHeroExperience() {
  const [lit, setLit] = useState(false);

  return (
    <section
      className={`axe-launch-hero relative overflow-hidden ${lit ? "axe-launch-hero-lit" : ""}`}
      data-landing-hero="true"
      aria-label="AXE Companion hero"
    >
      <div className="axe-launch-hero-grid" aria-hidden />
      <div className="axe-launch-hero-grid-hot" aria-hidden />

      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-12 md:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="axe-launch-kicker">
            <span className="axe-launch-kicker-dot" aria-hidden />
            {LANDING_HERO.badge}
          </div>

          <h1 className="mx-auto mt-8 max-w-[920px] text-[2.6rem] font-extrabold leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl md:text-[5.2rem]">
            {LANDING_HERO.titleLead}
            <br />
            <span className="axe-launch-gradient">{LANDING_HERO.titleAccent}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-[760px] text-[15px] leading-relaxed text-white/55 sm:text-base sm:leading-8">
            {LANDING_HERO.body}
          </p>

          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <a href="#hero-devices" className="axe-launch-btn-primary">
              Try the live demo
            </a>
            <a href="#pricing" className="axe-launch-btn-secondary">
              See pricing
            </a>
          </div>
        </div>

        <div className="mt-12">
          <LandingHeroDevices onLitChange={setLit} />
        </div>
      </div>

      <div className="axe-launch-rail" aria-label="Product highlights">
        {LANDING_RAIL.map((item) => (
          <span key={item} className="axe-launch-rail-item">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
