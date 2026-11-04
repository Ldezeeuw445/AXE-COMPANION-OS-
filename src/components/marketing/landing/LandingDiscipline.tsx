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
          <div>
            <p className="axe-launch-eyebrow">{LANDING_DISCIPLINE.kicker}</p>
            <h3 className="mt-3 max-w-xl text-[1.7rem] font-extrabold tracking-[-0.04em] text-white sm:text-[2.2rem]">
              {LANDING_DISCIPLINE.title}
            </h3>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/55">
              {LANDING_DISCIPLINE.body}
            </p>
            <p className="mt-4 max-w-xl text-[15px] font-medium leading-relaxed text-cyan-100/90">
              {LANDING_DISCIPLINE.aside}
            </p>
            <a href="/login?next=/cockpit" className="axe-launch-btn-primary mt-8">
              See your Cockpit
            </a>
          </div>

          <aside className="axe-launch-fit" aria-label="Alignment example">
            <p className="axe-launch-fit-kicker">Alignment</p>
            <div className="axe-launch-gauge" aria-hidden>
              <svg width="230" height="230" viewBox="0 0 230 230">
                <circle
                  cx="115"
                  cy="115"
                  r="100"
                  fill="none"
                  stroke="rgba(255,255,255,.06)"
                  strokeWidth="14"
                />
                <circle
                  cx="115"
                  cy="115"
                  r="100"
                  fill="none"
                  stroke="url(#axe-fit-gg)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray="628"
                  strokeDashoffset="157"
                  transform="rotate(-90 115 115)"
                />
                <defs>
                  <linearGradient id="axe-fit-gg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="axe-launch-gauge-val">
                <span>75</span>
                <small>alignment / 100</small>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-white/45">
              Alignment is based on current saved context, messages, journal patterns and account
              history.
            </p>
            <p className="mt-3 text-sm font-medium leading-snug text-white/85">
              How often the assistant&apos;s proposals feel like your book — not a generic playbook.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/35">
              Example cockpit chrome — live alignment uses your own workspace signals, not this sample.
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
