import { LANDING_ADAPTIVE, LANDING_ENGINE, LANDING_ONE } from "@/lib/marketing/landingCopy";

function Cube({ label }: { label: string }) {
  return (
    <div className="axe-landing-cube" aria-hidden>
      <span className="axe-landing-cube-face">{label}</span>
    </div>
  );
}

function ItemList({
  items,
}: {
  items: ReadonlyArray<{ label: string; body: string }>;
}) {
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/90">{item.label}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-tos-muted">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function LandingEngine() {
  return (
    <section className="relative z-10 border-t border-white/[0.04] px-5 py-14 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
        <div className="axe-landing-card-glow p-6 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
            {LANDING_ENGINE.kicker}
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white md:text-3xl">{LANDING_ENGINE.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-tos-muted">{LANDING_ENGINE.body}</p>
          <Cube label="AXE ENGINE" />
          <ItemList items={LANDING_ENGINE.items} />
        </div>

        <div className="axe-landing-card-glow p-6 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
            {LANDING_ONE.kicker}
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white md:text-3xl">{LANDING_ONE.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-tos-muted">{LANDING_ONE.body}</p>
          <Cube label="AXE ONE" />
          <ItemList items={LANDING_ONE.items} />
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl axe-landing-card-glow p-6 md:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          {LANDING_ADAPTIVE.kicker}
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white md:text-3xl">{LANDING_ADAPTIVE.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-tos-muted">{LANDING_ADAPTIVE.body}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LANDING_ADAPTIVE.items.map((item) => (
            <li key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/90">{item.label}</p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-tos-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
