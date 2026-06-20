"use client";

import Link from "next/link";
import { Check, Mail, Sparkles, X, Zap } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import {
  AXE_BILLING_TIERS,
  TRADING_OS_FOUNDER_TIER,
  type AxeBillingTier,
  type AxePlanId,
} from "@/lib/billing/tiers";
import type { UserAxeEntitlement, BillingCatalogState } from "@/lib/billing/types";

type Props = {
  entitlement: UserAxeEntitlement;
  catalog: BillingCatalogState;
  userId: string | null;
  checkoutLinks: Partial<Record<AxePlanId, string | null>>;
  billingReady: Partial<Record<AxePlanId, boolean>>;
};

function tierVisible(tier: AxeBillingTier, catalog: BillingCatalogState): boolean {
  if (tier.id === "free") return true;
  if (tier.id === "pro") return true;
  if (tier.id === "founder") return catalog.founderAvailable;
  if (tier.id === "elite") return catalog.eliteAvailable;
  return false;
}

export function UpgradeTierGrid({
  entitlement,
  catalog,
  userId,
  checkoutLinks,
  billingReady,
}: Props) {
  const visibleTiers = AXE_BILLING_TIERS.filter((t) => tierVisible(t, catalog));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {visibleTiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            isCurrent={entitlement.plan === tier.id}
            checkoutHref={checkoutLinks[tier.id] ?? null}
            billingReady={billingReady[tier.id] ?? false}
            userId={userId}
            founderRemaining={
              tier.id === "founder"
                ? Math.max(0, catalog.founderSeatsCap - catalog.founderSeatsUsed)
                : null
            }
          />
        ))}
      </div>

      {!catalog.founderAvailable && !catalog.eliteAvailable ? null : !catalog.eliteAvailable ? (
        <p className="text-center text-[11px] text-tos-dim">
          Founder · {catalog.founderSeatsUsed}/{catalog.founderSeatsCap} spots claimed — Elite unlocks
          when Founder sells out.
        </p>
      ) : (
        <p className="text-center text-[11px] text-tos-dim">
          Founder sold out — Elite is now the top Companion tier for new members.
        </p>
      )}

      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
            Trading OS · coming soon
          </h3>
          <Badge variant="warm">Separate product</Badge>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-tos-muted">
          {TRADING_OS_FOUNDER_TIER.label} — €{TRADING_OS_FOUNDER_TIER.priceEurMonthly}/mo full desktop
          terminal. Active AXE Founder members qualify for €{TRADING_OS_FOUNDER_TIER.axeFounderPriceEurMonthly}
          /mo Founder pricing (not available on Pro or Elite).
        </p>
      </GlassPanel>
    </div>
  );
}

function TierCard({
  tier,
  isCurrent,
  checkoutHref,
  billingReady,
  userId,
  founderRemaining,
}: {
  tier: AxeBillingTier;
  isCurrent: boolean;
  checkoutHref: string | null;
  billingReady: boolean;
  userId: string | null;
  founderRemaining: number | null;
}) {
  const isPaidTier = tier.id !== "free";
  const highlighted = tier.badge === "Recommended";

  return (
    <GlassPanel
      className={`flex h-full flex-col p-5 ${highlighted ? "ring-1 ring-cyan-400/25" : ""}`}
      glow="none"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
          {tier.label}
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {isCurrent ? <Badge variant="neutral">Current</Badge> : null}
          {tier.badge && !isCurrent ? (
            <Badge variant={tier.id === "founder" ? "warm" : "long"}>{tier.badge}</Badge>
          ) : null}
          {founderRemaining != null ? (
            <Badge variant="warm">{founderRemaining} left</Badge>
          ) : null}
        </div>
      </div>

      <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-tos-text">
        {tier.priceEurMonthly == null ? "—" : `€${tier.priceEurMonthly}`}
        {tier.priceEurMonthly != null && tier.priceEurMonthly > 0 ? (
          <span className="text-base text-tos-muted">/mo</span>
        ) : null}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-tos-dim">{tier.headline}</p>

      <ul className="mt-4 flex-1 space-y-1.5 text-xs text-tos-muted">
        {tier.includes.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/85" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
        {tier.extraBenefits?.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/70" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
        {tier.restrictions?.map((item) => (
          <li key={item} className="flex items-start gap-2 text-tos-dim">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300/70" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {tier.notes?.length ? (
        <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-tos-dim">
          {tier.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      ) : null}

      {isPaidTier && !isCurrent ? (
        billingReady && checkoutHref && userId ? (
          <a
            href={checkoutHref}
            target="_blank"
            rel="noopener noreferrer"
            className="tos-btn-cyan mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold"
          >
            <Zap className="h-3.5 w-3.5" />
            Upgrade to {tier.label}
          </a>
        ) : billingReady ? (
          <div className="tos-matte-banner mt-5">
            <span className="tos-accent-dot tos-accent-dot--amber mt-0.5 shrink-0" aria-hidden />
            <p className="text-[11px] text-white/78">Sign in first — billing links to your account.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            <div className="tos-matte-banner">
              <span className="tos-accent-dot tos-accent-dot--amber mt-0.5 shrink-0" aria-hidden />
              <p className="text-[11px] text-white/78">{tier.label} checkout is being prepared.</p>
            </div>
            <Link
              href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@tradingosapp.com"}?subject=AXE%20${encodeURIComponent(tier.label)}%20waitlist`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.05] py-2.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/[0.08]"
            >
              <Mail className="h-3.5 w-3.5" />
              Notify me
            </Link>
          </div>
        )
      ) : null}
    </GlassPanel>
  );
}
