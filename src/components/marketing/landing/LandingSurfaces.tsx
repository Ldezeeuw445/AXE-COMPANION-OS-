import { LANDING_SURFACES } from "@/lib/marketing/landingCopy";

export function LandingSurfaces() {
  return (
    <section id="product" className="relative z-10 scroll-mt-24 border-t border-white/[0.04] px-5 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          {LANDING_SURFACES.kicker}
        </p>
        <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-white md:text-4xl">
          {LANDING_SURFACES.title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-tos-muted md:text-base">
          {LANDING_SURFACES.body}
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="axe-landing-card-glow p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/85">AXE Companion</p>
            <p className="mt-2 text-lg font-semibold text-white">Mobile command center</p>
            <p className="mt-2 text-sm leading-relaxed text-tos-muted">
              Chart, depth, news, execute, journal, AXE — the phone OS you trade from today.
            </p>
          </div>
          <div className="axe-landing-card-glow p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/85">Trading OS</p>
            <p className="mt-2 text-lg font-semibold text-white">Desktop terminal</p>
            <p className="mt-2 text-sm leading-relaxed text-tos-muted">
              Multi-chart desk on the same login. Private beta — the switcher in the header is the move across.
            </p>
          </div>
        </div>

        <blockquote className="mx-auto mt-10 max-w-3xl text-center text-sm italic leading-relaxed text-white/45 md:text-base">
          “{LANDING_SURFACES.quote}”
        </blockquote>
      </div>
    </section>
  );
}
