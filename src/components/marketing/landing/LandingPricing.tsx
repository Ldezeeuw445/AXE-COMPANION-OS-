import Link from "next/link";
import {
  AXE_BILLING_TIERS,
  FOUNDER_SEAT_CAP,
} from "@/lib/billing/tiers";
import type { BillingCatalogState } from "@/lib/billing/types";
import { LEGAL_COPY } from "@/lib/legal/constants";
import { LandingWaitlist } from "@/components/marketing/LandingWaitlist";
import { LandingOpenAppQr } from "@/components/marketing/LandingOpenAppQr";

type Props = {
  catalog: BillingCatalogState | null;
};

export function LandingPricing({ catalog }: Props) {
  const founderUsed = catalog?.founderSeatsUsed;
  const founderCap = catalog?.founderSeatsCap ?? FOUNDER_SEAT_CAP;

  return (
    <section id="pricing" className="relative z-10 scroll-mt-24 border-t border-white/[0.04] px-5 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-3 text-center text-3xl font-bold text-white md:text-4xl">Simple pricing.</h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-sm text-tos-muted">
          Start free on the full mobile OS — upgrade when you need unlimited AXE and the complete workflow
          stack.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AXE_BILLING_TIERS.map((tier) => {
            const highlight = tier.badge === "Recommended";
            const lines = [
              ...tier.includes,
              ...(tier.extraBenefits ?? []),
              ...(tier.restrictions ?? []),
            ];
            return (
              <div
                key={tier.id}
                className={`axe-landing-card-glow flex flex-col p-6 ${highlight ? "ring-1 ring-cyan-400/25" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3
                    className={`text-xs font-medium uppercase tracking-widest ${
                      highlight ? "text-cyan-200/90" : "text-tos-dim"
                    }`}
                  >
                    {tier.label}
                  </h3>
                  {tier.badge ? (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                        highlight
                          ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-200/95"
                          : "border border-white/10 bg-white/[0.04] text-white/65"
                      }`}
                    >
                      {tier.badge}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-3xl font-semibold text-white">
                  €{tier.priceEurMonthly ?? 0}
                  {tier.priceEurMonthly ? (
                    <span className="text-sm font-normal text-tos-dim">/mo</span>
                  ) : null}
                </p>
                <p className="mt-1.5 text-[11.5px] leading-snug text-tos-dim">{tier.headline}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-tos-dim">
                  {tier.dailyChatCap === null
                    ? `Unlimited AXE chat — fair use soft ceiling ${tier.fairUseSoftCapPerDay}/day (plenty for daily trading)`
                    : `${tier.dailyChatCap} AXE sends per day`}
                </p>

                <ul className="mt-4 flex-1 space-y-1.5 text-[12.5px] leading-snug text-tos-muted">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>

                {tier.notes?.map((note) => (
                  <p key={note} className="mt-3 text-[11px] leading-snug text-white/40">
                    {note}
                  </p>
                ))}

                <Link
                  href={tier.priceEurMonthly ? "/login" : "/signup"}
                  className={
                    highlight
                      ? "axe-landing-cta mt-5 inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-5 text-xs font-semibold text-[#04161B] shadow-[0_10px_30px_-10px_rgba(34,211,238,0.55)] transition hover:from-cyan-300 hover:to-teal-300"
                      : "mt-5 inline-flex h-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-5 text-xs font-medium text-white transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06] hover:text-cyan-100"
                  }
                >
                  {tier.priceEurMonthly ? `Choose ${tier.label}` : "Start free"}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Explicit pricing facts — customer feedback 2026-10-29 (Luka signed off) */}
        <div className="axe-landing-card-glow mx-auto mt-8 max-w-3xl p-5 text-left text-[12.5px] leading-relaxed text-tos-muted">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
            What the plan includes — plain facts
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-4">
            <li>
              <strong className="font-medium text-white/85">Broker accounts:</strong> Free{" "}
              <strong className="font-medium text-white/85">1</strong> live, Pro{" "}
              <strong className="font-medium text-white/85">3</strong>, Founder{" "}
              <strong className="font-medium text-white/85">5</strong>, Elite{" "}
              <strong className="font-medium text-white/85">10</strong> — plus unlimited demo/paper on
              every plan.
            </li>
            <li>
              <strong className="font-medium text-white/85">Brokers that work today:</strong> MT5 via
              MetaApi cloud (or hashed EA/bridge token), and Alpaca (US equities paper/live when
              configured).
            </li>
            <li>
              <strong className="font-medium text-white/85">Cloud connection cost:</strong> the MetaApi /
              Alpaca link is included in your AXE subscription — no separate AXE charge for the
              connection. Your broker may still charge its own fees.
            </li>
            <li>
              <strong className="font-medium text-white/85">Unlimited — fair use:</strong> paid plans have
              no hard daily chat cut-off. Soft ceilings: Pro{" "}
              <strong className="font-medium text-white/85">200</strong> AXE sends/day, Founder &amp; Elite{" "}
              <strong className="font-medium text-white/85">500</strong>/day — plenty for daily trading. At
              the limit we show a friendly notice, not a hard surprise block. Free stays at 20/day.
            </li>
            <li>
              <strong className="font-medium text-white/85">Permanent Founder status:</strong> keep your
              Founder price forever as long as you stay subscribed. Cancel and you keep the Founder
              badge; if you return later you pay the normal rate. Elite never gets Founder perks.
            </li>
            <li>
              <strong className="font-medium text-white/85">Elite Roadmap items</strong> (advanced models,
              premium voice, higher AI limits) are labelled Roadmap on the card — they are not current
              benefits.
            </li>
          </ul>
        </div>

        <p
          className="mx-auto mt-5 max-w-2xl text-center text-[11.5px] leading-relaxed text-tos-dim"
          data-testid="founder-seats"
        >
          {typeof founderUsed === "number" ? (
            <>
              Founder · {founderUsed}/{founderCap} spots claimed — Elite unlocks when Founder sells out.
              Founder members keep their badge; the Founder price holds while they stay subscribed.
            </>
          ) : (
            <>
              Founder is capped at {FOUNDER_SEAT_CAP} seats. When they are gone Founder closes permanently
              and Elite takes its place for new upgrades — Founder members keep their badge; the Founder
              price holds while they stay subscribed.
            </>
          )}{" "}
          You pick a plan inside the app after signing in; checkout runs on Stripe.
        </p>

        <p className="mx-auto mt-6 max-w-2xl px-2 text-center text-[10px] leading-relaxed text-tos-dim">
          {LEGAL_COPY.tradingShort} {LEGAL_COPY.pricing}
        </p>

        <div className="mx-auto mt-14 max-w-2xl" id="waitlist">
          <p className="mb-3 text-center text-xs text-tos-dim">
            Waitlist is for <strong className="font-medium text-white/70">Trading OS</strong> (desktop
            terminal) and other coming-soon surfaces — Companion itself is available now via Start free.
          </p>
          <LandingWaitlist />
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <h3 className="mb-4 text-center text-lg font-semibold text-white">Open on your phone</h3>
          <LandingOpenAppQr />
        </div>
      </div>
    </section>
  );
}
