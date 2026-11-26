"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  LANDING_CAPTURE_NOTE,
  LANDING_HERO,
  LANDING_RAIL,
  LANDING_REAL_CAPTURES,
} from "@/lib/marketing/landingCopy";

/**
 * Companion hero.
 *
 * The phones show real captures of the live site, not a mock. The hero used to
 * iframe `/hero-demo/app.html`, a hand-built walkthrough with made-up numbers.
 * Luka's rule is no mock or demo data anywhere, so it is gone. The screens a
 * stranger can see without an account are sign-in and create-account; those
 * are what is shown, dated, at phone size. Below 640px only the first phone
 * shows (globals.css), so a 375px screen gets one legible phone, not two
 * shrunken ones.
 */
export function LaunchHeroExperience() {
  const [lit, setLit] = useState(false);

  return (
    <section
      className={`axe-launch-hero relative overflow-hidden ${lit ? "axe-launch-hero-lit" : ""}`}
      data-landing-hero="true"
      aria-label="AXE Companion hero"
    >
      <div aria-hidden className="axe-hero-light pointer-events-none absolute inset-0 z-[1]" />
      <div
        aria-hidden
        className="axe-hero-headline-dots pointer-events-none absolute inset-x-0 top-0 z-[1] h-[640px]"
      />
      <div className="axe-launch-hero-grid" aria-hidden />
      <div className="axe-launch-hero-grid-hot" aria-hidden />

      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-10 md:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="axe-launch-kicker">
            <span className="axe-launch-kicker-dot" aria-hidden />
            {LANDING_HERO.badge}
          </div>

          <h1 className="mx-auto mt-7 max-w-[920px] text-[2.5rem] font-extrabold leading-[0.98] tracking-[-0.05em] text-white sm:text-6xl md:text-[5rem]">
            {LANDING_HERO.titleLead}
            <br />
            <span className="axe-launch-gradient">{LANDING_HERO.titleAccent}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-[680px] text-[15px] leading-relaxed text-white/60 sm:text-base sm:leading-8">
            {LANDING_HERO.body}
          </p>

          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className="axe-launch-btn-primary">
              Create your account
            </Link>
            <a href="#pricing" className="axe-launch-btn-secondary">
              See pricing
            </a>
          </div>
          <p className="mt-4 text-center text-xs text-white/45">
            Already have an account?{" "}
            <Link href="/login" className="text-white/70 underline-offset-2 hover:text-white hover:underline">
              Log in
            </Link>
          </p>
        </div>

        <div id="hero-devices" className="relative mx-auto mt-12 w-full max-w-[820px] scroll-mt-28">
          <div className={`axe-hero-dots ${lit ? "axe-hero-dots-active" : ""}`} aria-hidden />
          <div
            className={`axe-hero-stage axe-hero-stage--captures ${lit ? "axe-hero-stage-active" : ""}`}
            data-hero-stage="true"
            onPointerEnter={() => setLit(true)}
            onPointerLeave={() => setLit(false)}
          >
            {LANDING_REAL_CAPTURES.map((capture, index) => (
              <figure
                key={capture.src}
                className={`axe-hero-device axe-hero-device--phone ${index > 0 ? "axe-hero-device--second" : ""}`}
              >
                <div className="axe-hero-bezel">
                  <div className="axe-hero-screen">
                    <Image
                      src={capture.src}
                      alt={capture.alt}
                      width={780}
                      height={1688}
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                      sizes="(max-width: 639px) 88vw, 300px"
                      className="absolute inset-0 h-full w-full object-cover object-top"
                    />
                  </div>
                </div>
                <figcaption className="mt-3 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
                  {capture.caption}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="relative z-10 mx-auto mt-4 max-w-md text-center text-[12px] leading-relaxed text-white/50">
            {LANDING_CAPTURE_NOTE}
          </p>
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
