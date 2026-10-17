import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { LANDING_FINAL_CTA } from "@/lib/marketing/landingCopy";

export function LandingFinalCta() {
  return (
    <section className="relative z-10 border-t border-white/[0.04] px-5 py-14">
      <div className="axe-landing-card-glow mx-auto max-w-3xl p-10 text-center">
        <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/22 bg-cyan-400/[0.06] px-3 py-1 text-[11px] font-medium text-cyan-100/95">
          <Target className="h-3 w-3 text-cyan-300" aria-hidden />
          Ready to trade
        </div>
        <p className="text-lg font-semibold text-white md:text-xl">
          {LANDING_FINAL_CTA.titleLead}{" "}
          <span className="axe-landing-heading-shimmer">{LANDING_FINAL_CTA.titleAccent}</span>
        </p>
        <p className="mt-2 max-w-xl text-sm text-tos-muted">{LANDING_FINAL_CTA.body}</p>
        <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="axe-landing-cta inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-8 text-sm font-semibold text-[#04161B] shadow-[0_18px_44px_-14px_rgba(34,211,238,0.55)] transition hover:from-cyan-300 hover:to-teal-300"
          >
            Start free
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/chat"
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-8 text-sm font-medium text-white transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]"
          >
            Open app
          </Link>
          <Link
            href="/welcome"
            className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-300/22 bg-cyan-300/[0.04] px-8 text-sm font-medium text-cyan-100/90 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08]"
          >
            PWA install
          </Link>
        </div>
        <a href="#waitlist" className="mt-5 inline-block text-xs text-white/40 transition hover:text-white/65">
          Join the AXE Companion waitlist
        </a>
      </div>
    </section>
  );
}
