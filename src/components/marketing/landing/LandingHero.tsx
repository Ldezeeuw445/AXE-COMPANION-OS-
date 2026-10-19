import Link from "next/link";
import { ChevronRight, Smartphone } from "lucide-react";
import { LandingHeroDevices } from "@/components/marketing/LandingHeroDevices";
import { LANDING_HERO } from "@/lib/marketing/landingCopy";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden" style={{ minHeight: "min(100svh, 920px)" }}>
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(5,5,8,0.18) 0%, rgba(5,5,8,0.04) 45%, rgba(5,5,8,0.02) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-12 md:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
            style={{
              background: "linear-gradient(135deg, rgba(0,224,255,0.14) 0%, rgba(0,224,255,0.05) 100%)",
              border: "1px solid rgba(34,211,238,0.32)",
              boxShadow: "0 0 22px rgba(0,224,255,0.07)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
            </span>
            <span className="text-cyan-200/95">{LANDING_HERO.badge}</span>
          </div>

          <h1 className="mx-auto mt-7 max-w-[720px] text-[2.4rem] font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl md:text-[3.35rem]">
            {LANDING_HERO.titleLead}
            <br />
            <span className="axe-landing-heading-shimmer">{LANDING_HERO.titleAccent}</span>
          </h1>

          <p className="mx-auto mt-5 max-w-[640px] text-[15px] leading-relaxed text-white/60 sm:text-base">
            {LANDING_HERO.body}
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <Link
              href="/signup"
              className="axe-landing-cta inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-7 text-sm font-semibold text-[#04161B] shadow-[0_18px_44px_-14px_rgba(34,211,238,0.65)] transition hover:from-cyan-300 hover:to-teal-300"
            >
              Start free
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/chat"
              className="inline-flex h-12 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.04] px-5 text-sm font-medium text-cyan-100/90 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08]"
            >
              Open app
            </Link>
            <Link
              href="/welcome"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-white/75 transition hover:border-white/20 hover:text-white"
            >
              <Smartphone className="h-4 w-4 text-cyan-300/90" aria-hidden />
              Install as PWA
            </Link>
            <a
              href="#waitlist"
              className="text-center text-xs text-white/40 transition hover:text-white/65"
            >
              Join waitlist
            </a>
          </div>
        </div>

        <div className="mt-14">
          <LandingHeroDevices />
        </div>
      </div>
    </section>
  );
}
