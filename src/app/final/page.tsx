import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Sparkles, TerminalSquare } from "lucide-react";
import { LegalNavLinks } from "@/components/legal/LegalNavLinks";
import { FinalHeroExperience } from "@/components/marketing/FinalHeroExperience";
import { FinalTerminalShowcase } from "@/components/marketing/FinalTerminalShowcase";

export const metadata: Metadata = {
  title: "AXE Companion Final",
  description:
    "Interactive launch mock for AXE Companion with clickable app tabs and a Trading Terminal preview.",
};

export default function FinalPage() {
  return (
    <div className="launch-page relative min-h-dvh">
      <div className="launch-noise" />

      <header className="sticky top-0 z-50 border-b border-white/7 bg-[#070709]/78 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-3.5 sm:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/72">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            Final launch mock
          </div>
          <div className="flex items-center gap-2">
            <Link href="/launch" className="launch-nav-link hidden sm:inline-flex">
              /launch
            </Link>
            <Link href="/login" className="launch-primary-btn">
              Open AXE
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="px-5 pb-14 pt-10 sm:px-8 sm:pt-14 lg:pb-20">
          <FinalHeroExperience />
        </section>

        <section className="px-5 py-2 sm:px-8">
          <div className="launch-meta-banner mx-auto max-w-6xl">
            <div className="launch-meta-track">
            {[
              "Click through live app tabs",
              "Hero explains itself",
              "Supabase one source of truth",
              "Terminal + mobile companion",
            ].map((item) => (
              <span key={item} className="launch-meta-item">
                {item}
              </span>
            ))}
            {[...Array(2)].map((_, idx) =>
              [
                "Click through live app tabs",
                "Hero explains itself",
                "Supabase one source of truth",
                "Terminal + mobile companion",
              ].map((item) => (
                <span key={`${item}-${idx}`} className="launch-meta-item">
                  {item}
                </span>
              )),
            )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="launch-copy-card">
            <p className="launch-panel-kicker">Why this matters</p>
            <h2 className="mt-4 font-[family-name:var(--font-space)] text-3xl tracking-[-0.05em] text-white sm:text-4xl">
              The hero should already close the pitch.
            </h2>
            <p className="mt-5 max-w-4xl text-[15px] leading-7 text-white/58">
              The app started as a way to keep your AI trading assistant in your
              pocket when you were away from the terminal. Now both products are
              converging into one workspace memory layer, with the same Supabase
              source of truth for context, preferences and execution state.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-18 sm:px-8 lg:pb-24">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">
            <TerminalSquare className="h-3.5 w-3.5" />
            Trading Terminal · coming soon
          </div>
          <FinalTerminalShowcase />
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/7 px-5 py-10 text-center text-[11px] text-white/34 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="font-medium uppercase tracking-[0.24em] text-white/38">
            AXE Companion + Trading Terminal
          </p>
          <p className="mt-3 text-white/42">
            One workspace memory. Two surfaces. Same source of truth.
          </p>
          <LegalNavLinks className="mt-6" />
        </div>
      </footer>
    </div>
  );
}
