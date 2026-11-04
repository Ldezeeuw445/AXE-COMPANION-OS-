import { LANDING_DISCIPLINE, LANDING_INTEL_FEED_COUNT } from "@/lib/marketing/landingCopy";

export function LandingDiscipline() {
  return (
    <section id="cockpit" className="relative scroll-mt-24">
      <div className="axe-launch-band">
        <p className="axe-launch-eyebrow">{LANDING_DISCIPLINE.kicker}</p>
        <h2 className="axe-launch-band-title">{LANDING_DISCIPLINE.title}</h2>
        <p className="axe-launch-band-copy">{LANDING_DISCIPLINE.body}</p>
      </div>

      <div className="px-5 py-10 md:py-14">
        <div className="axe-launch-split mx-auto">
          {/* Hier stonden de kicker, de kop en de body nog een tweede keer,
              woordelijk gelijk aan de band hierboven. Met de behavior map
              eronder, die dezelfde kop draagt, stond "Execution discipline,
              from your fills." drie keer op één pagina. De band is de kop van
              dit blok; hier begint de tekst. */}
          <div>
            <p className="max-w-xl text-[15px] font-medium leading-relaxed text-cyan-100/90">
              {LANDING_DISCIPLINE.aside}
            </p>
            <a href="/login?next=/cockpit" className="axe-launch-btn-primary mt-8">
              See your Cockpit
            </a>
          </div>

          <aside className="axe-launch-fit" aria-label="Alignment example">
            <p className="axe-launch-fit-kicker">Alignment</p>
            {/* De 75-meter stond hier én in de behavior map hieronder. Eén
                getal dat twee keer op het scherm staat leest als twee
                metingen. Hij staat nu alleen in de map, samen met de sessies,
                instrumenten en patronen waar hij uit volgt. Wat hieronder
                blijft is juist wat die map niet toont. */}
            <p className="text-[12px] leading-relaxed text-white/45">
              The alignment score and what it is built from are in the behavior map below. What
              follows is what that map does not show: the rules you held, and where AXE is still
              calibrating.
            </p>

            <div className="axe-launch-kp">
              <div className="axe-launch-kp-box axe-launch-kp-box--kept">
                <p className="n">5</p>
                <p className="l">Rules kept</p>
              </div>
              <div className="axe-launch-kp-box axe-launch-kp-box--passed">
                <p className="n">2</p>
                <p className="l">Rules passed</p>
              </div>
            </div>

            <div className="mt-5">
              <p className="axe-launch-fit-label">Learning Arc</p>
              <FitBar label="XAUUSD Analysis" value="Strong" width="82%" />
              <FitBar label="Trade Planning" value="Stabilized" width="68%" />
              <FitBar label="Seamless Access" value="Calibrating" width="54%" />
            </div>
          </aside>
        </div>

        <div className="axe-launch-stats mx-auto mt-12">
          <div>
            <p className="axe-launch-stat-num">{LANDING_INTEL_FEED_COUNT}</p>
            <p className="axe-launch-stat-lbl">AXE intel feeds</p>
          </div>
          <div>
            <p className="axe-launch-stat-num">1 tap</p>
            <p className="axe-launch-stat-lbl">To execute</p>
          </div>
          <div>
            <p className="axe-launch-stat-num">€0</p>
            <p className="axe-launch-stat-lbl">To start</p>
          </div>
        </div>

        <blockquote className="axe-launch-quote mx-auto mt-14">
          <p>&ldquo;{LANDING_DISCIPLINE.quote}&rdquo;</p>
          <footer>{LANDING_DISCIPLINE.quoteBy}</footer>
        </blockquote>
      </div>
    </section>
  );
}

function FitBar({ label, value, width }: { label: string; value: string; width: string }) {
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <strong className="font-medium text-white/80">{label}</strong>
        <span className="tabular-nums text-white/45">{value}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <i className="block h-full rounded-full bg-cyan-300/80" style={{ width }} />
      </div>
    </div>
  );
}
