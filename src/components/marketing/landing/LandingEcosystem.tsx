import { ChevronRight, Monitor, Smartphone } from "lucide-react";
import { LANDING_ECOSYSTEM } from "@/lib/marketing/landingCopy";
import { ONE_SUBSCRIPTION_NOTE } from "@/lib/billing/tiers";
import { availabilityLabel, ecosystemApp, isReachable } from "@/lib/ecosystem/apps";

/**
 * Where Companion sits: the phone app next to Trading OS on the desk, both on
 * one account and one database, with AXE in both. Replaces the old "Second
 * Brain" band and the separate Trading OS bridge card, which said the same
 * thing twice.
 */
export function LandingEcosystem() {
  const tradingOs = ecosystemApp("trading-os");
  const tradingOsBadge = tradingOs ? availabilityLabel(tradingOs.availability) : null;
  const { phone, desk } = LANDING_ECOSYSTEM;

  return (
    <section id="ecosystem" className="relative scroll-mt-24 px-5 py-16 md:py-24">
      <div className="relative mx-auto max-w-5xl">
        <div className="text-center">
          <div className="axe-launch-kicker">
            <span className="axe-launch-kicker-dot" aria-hidden />
            {LANDING_ECOSYSTEM.badge}
          </div>
          <h2 className="mt-7 text-[2.2rem] font-extrabold leading-[1] tracking-[-0.045em] text-white sm:text-5xl md:text-[3.6rem]">
            {LANDING_ECOSYSTEM.titleLead}
            <br />
            <span className="axe-launch-gradient">{LANDING_ECOSYSTEM.titleAccent}</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-white/60 sm:text-base">
            {LANDING_ECOSYSTEM.body}
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="axe-landing-card-glow p-6 ring-1 ring-cyan-400/25">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-cyan-300" aria-hidden />
              <div>
                <h3 className="text-base font-semibold text-white">{phone.name}</h3>
                <p className="text-[12px] text-white/50">{phone.where} · you are here</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-white/70">
              {phone.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="axe-landing-card-glow p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Monitor className="h-5 w-5 text-cyan-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">{desk.name}</h3>
                <p className="text-[12px] text-white/50">{desk.where}</p>
              </div>
              {tradingOsBadge ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/60">
                  {tradingOsBadge}
                </span>
              ) : null}
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-white/70">
              {desk.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {tradingOs && isReachable(tradingOs.availability) ? (
              <a
                href={tradingOs.url}
                className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-4 py-2 text-xs font-medium text-cyan-100/95 transition hover:border-cyan-300/45 hover:bg-cyan-300/[0.10]"
              >
                Go to Trading OS
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              <p className="mt-5 text-xs text-white/50">
                Trading OS is between hosts right now, so there is nothing to click yet.
              </p>
            )}
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-white/60">
          AXE, your personal trading assistant, is in both apps. {ONE_SUBSCRIPTION_NOTE}
        </p>
      </div>
    </section>
  );
}
