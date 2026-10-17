import Link from "next/link";
import { ChevronRight, Layout } from "lucide-react";
import { LANDING_TOS_BRIDGE } from "@/lib/marketing/landingCopy";
import { TRADING_OS_FOUNDER_TIER } from "@/lib/billing/tiers";
import { availabilityLabel, ecosystemApp, isReachable } from "@/lib/ecosystem/apps";

export function LandingTosBridge() {
  const tradingOs = ecosystemApp("trading-os");
  const tradingOsBadge = tradingOs ? availabilityLabel(tradingOs.availability) : null;

  return (
    <section className="relative z-10 px-5 pb-6">
      <div className="mx-auto max-w-6xl rounded-2xl border border-cyan-400/22 bg-cyan-400/[0.05] p-8 md:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100/95">
            <Layout className="h-3 w-3 text-cyan-300" aria-hidden />
            {LANDING_TOS_BRIDGE.kicker}
          </div>
          {tradingOsBadge ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/55">
              {tradingOsBadge}
            </span>
          ) : null}
        </div>

        <h3 className="mt-4 text-xl font-bold text-white md:text-2xl">{LANDING_TOS_BRIDGE.title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-white/65 md:text-base">{LANDING_TOS_BRIDGE.body}</p>

        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {LANDING_TOS_BRIDGE.features.map((feature) => (
            <li key={feature} className="text-sm text-cyan-50/85">
              {feature}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm leading-relaxed text-white/70">
          {TRADING_OS_FOUNDER_TIER.label} — €{TRADING_OS_FOUNDER_TIER.priceEurMonthly}/mo full desktop
          terminal. Active AXE Founder members qualify for €{TRADING_OS_FOUNDER_TIER.axeFounderPriceEurMonthly}/mo
          Founder pricing (not available on Pro or Elite). Not sold in Companion checkout yet.
        </p>
        <ul className="mt-3 space-y-1 text-[12.5px] text-white/55">
          {TRADING_OS_FOUNDER_TIER.includes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {tradingOs && isReachable(tradingOs.availability) ? (
          <Link
            href={tradingOs.url}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-4 py-2 text-xs font-medium text-cyan-100/95 transition hover:border-cyan-300/45 hover:bg-cyan-300/[0.10]"
          >
            Go to Trading OS
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <p className="mt-5 text-xs text-white/45">
            Trading OS is between hosts right now, so there is nothing to click yet — the terminal is
            coming back on the same login.
          </p>
        )}
      </div>
    </section>
  );
}
