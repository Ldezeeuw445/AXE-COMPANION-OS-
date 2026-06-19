import Image from "next/image";
import { CompanionLink, FeatureCards, WaitlistForm } from "@/components/WaitlistForm";

export default function HomePage() {
  return (
    <main className="relative min-h-svh overflow-hidden">
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(34,211,238,0.12),transparent)]"
      />

      <div className="relative mx-auto flex min-h-svh max-w-5xl flex-col px-5 pb-16 pt-10 sm:px-8">
        <header className="animate-fade-up flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/trading-os-logo.png"
              alt="Trading OS"
              width={44}
              height={44}
              className="rounded-xl"
              priority
            />
            <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-white">
              Trading OS
            </span>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60">
            Private beta
          </span>
        </header>

        <section className="animate-fade-up mt-16 flex flex-1 flex-col items-center text-center [animation-delay:80ms] sm:mt-20">
          <div className="relative mb-8">
            <div
              aria-hidden
              className="absolute inset-0 scale-110 rounded-3xl bg-[radial-gradient(circle,rgba(34,211,238,0.08),transparent_70%)] blur-2xl"
            />
            <Image
              src="/trading-os-logo.png"
              alt="Trading OS logo"
              width={160}
              height={160}
              className="relative rounded-3xl shadow-2xl shadow-cyan-500/10"
              priority
            />
          </div>

          <p className="text-xs font-medium uppercase tracking-[0.24em] text-cyan-400/80">The future of trading</p>
          <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            Premium desktop terminal.
            <span className="block text-white/70">Same brain as AXE Companion.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
            Trading OS is the desk your phone OS plugs into — multi-monitor charts, depth, intel, and guarded execution on
            the same Supabase spine.
          </p>

          <div className="mt-10 w-full">
            <WaitlistForm />
          </div>

          <p className="mt-6 text-sm text-white/45">
            Already trading on mobile?{" "}
            <CompanionLink />
          </p>
        </section>

        <section className="animate-fade-up mt-20 [animation-delay:160ms]">
          <FeatureCards />
        </section>

        <footer className="animate-fade-up mt-16 border-t border-white/8 pt-8 text-center text-xs text-white/40 [animation-delay:240ms]">
          <p>© {new Date().getFullYear()} Trading OS · support@tradingosapp.com</p>
          <p className="mt-2">
            AXE Companion ·{" "}
            <a href="https://axecompanion.com" className="text-white/55 hover:text-white/75">
              axecompanion.com
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
