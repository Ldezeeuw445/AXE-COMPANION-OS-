import { LANDING_SECOND_BRAIN } from "@/lib/marketing/landingCopy";

export function LandingSecondBrain() {
  return (
    <section className="relative px-5 py-16 md:py-24">
      <div className="axe-launch-second-dots pointer-events-none absolute left-[6%] top-10 h-48 w-48 opacity-70" aria-hidden />
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="axe-launch-kicker">
          <span className="axe-launch-kicker-dot" aria-hidden />
          {LANDING_SECOND_BRAIN.badge}
        </div>
        <h2 className="mt-7 text-[2.4rem] font-extrabold leading-[0.98] tracking-[-0.05em] text-white sm:text-6xl md:text-[4.4rem]">
          {LANDING_SECOND_BRAIN.titleLead}
          <br />
          <span className="axe-launch-gradient">{LANDING_SECOND_BRAIN.titleAccent}</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">
          {LANDING_SECOND_BRAIN.body}
        </p>
        <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <a href="#hero-devices" className="axe-launch-btn-primary">
            Try the live demo
          </a>
          <a href="#pricing" className="axe-launch-btn-secondary">
            See pricing
          </a>
        </div>
      </div>
    </section>
  );
}
