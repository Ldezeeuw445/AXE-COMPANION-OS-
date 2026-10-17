import { LANDING_SURFACES } from "@/lib/marketing/landingCopy";

export function LandingSurfaces() {
  return (
    <section id="product" className="relative z-10 scroll-mt-24 border-t border-white/[0.04] px-5 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <blockquote className="mx-auto max-w-3xl text-center text-sm italic leading-relaxed text-white/45 md:text-base">
          “{LANDING_SURFACES.quote}”
        </blockquote>

        <p className="mt-14 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          {LANDING_SURFACES.kicker}
        </p>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-[-0.03em] text-white md:text-4xl">
          {LANDING_SURFACES.title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-tos-muted md:text-base">
          {LANDING_SURFACES.body}
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="axe-landing-phone-card">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/85">AXE Companion</p>
            <p className="mt-3 text-lg font-semibold tracking-[-0.02em] text-white">Mobile command center</p>
            <p className="mt-2 text-sm leading-relaxed text-tos-muted">
              Chart, depth, news, execute, journal, AXE — the phone OS you trade from today.
            </p>
          </div>
          <div className="axe-landing-phone-card">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/85">Trading OS</p>
            <p className="mt-3 text-lg font-semibold tracking-[-0.02em] text-white">Desktop terminal</p>
            <p className="mt-2 text-sm leading-relaxed text-tos-muted">
              Multi-chart desk that stays in sync with the phone OS. Private beta — the switcher in the header is the move across.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
