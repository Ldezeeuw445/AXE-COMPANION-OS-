import Link from "next/link";
import { Crown } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { UpgradeTierGrid } from "@/components/billing/UpgradeTierGrid";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { skipChatQuota } from "@/lib/chatQuota";
import { LEGAL_COPY } from "@/lib/legal/constants";
import type { AxePlanId } from "@/lib/billing/tiers";
import {
  getBillingCatalogState,
  getUserAxeEntitlement,
  isBillingConfiguredForTier,
  paymentLinkForTier,
} from "@/services/billingService";

export default async function SubscriptionsPage() {
  const supabase = await createServerSupabaseClient();
  let entitlement = {
    plan: "free" as AxePlanId,
    isPaid: false,
    founderBadge: false,
    proUntil: null as string | null,
    chatQuotaExempt: false,
    label: "Free",
  };
  let catalog = {
    founderSeatsUsed: 0,
    founderSeatsCap: 100,
    founderAvailable: true,
    eliteAvailable: false,
  };
  let userId: string | null = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      [entitlement, catalog] = await Promise.all([
        getUserAxeEntitlement(supabase, user.id),
        getBillingCatalogState(supabase),
      ]);
    }
  }

  const paidTiers: AxePlanId[] = ["pro", "founder", "elite"];
  const checkoutLinks = Object.fromEntries(
    paidTiers.map((id) => [id, paymentLinkForTier(id, userId)]),
  ) as Partial<Record<AxePlanId, string | null>>;
  const billingReady = Object.fromEntries(
    paidTiers.map((id) => [id, isBillingConfiguredForTier(id)]),
  ) as Partial<Record<AxePlanId, boolean>>;

  const anyBillingReady = paidTiers.some((id) => billingReady[id]);
  const upgradeReady = Boolean(supabase) && anyBillingReady;

  const toolbarSections: AxeToolbarSection[] = [
    {
      id: "ask-axe",
      title: "Ask AXE",
      items: [
        {
          id: "compare",
          label: "Compare Free vs Pro",
          description: "What actually changes?",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · subscriptions]\nCompare Free vs Pro for AXE Companion. Be honest and concise.",
          )}`,
        },
        {
          id: "founder",
          label: "What is Founder?",
          description: "100 spots + Trading OS bonus",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · founder]\nExplain AXE Founder vs Pro vs Elite and the Trading OS pricing bonus.",
          )}`,
        },
      ],
    },
    {
      id: "shortcuts",
      title: "Shortcuts",
      items: [
        { id: "chat", label: "Back to chat", href: "/chat" },
        { id: "settings", label: "Settings", href: "/settings" },
      ],
    },
  ];

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
      <LiveStatusReporter
        liveCount={(supabase ? 1 : 0) + (anyBillingReady ? 1 : 0)}
        totalCount={2}
        label={`Subscriptions · ${entitlement.label}`}
        allLiveOverride={upgradeReady ? true : false}
      />
      <AxeTopBarInjector
        title="Subscriptions"
        subtitle={entitlement.isPaid ? `You’re on ${entitlement.label}` : "Free → Pro → Founder → Elite"}
        sections={toolbarSections}
        center={
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Subscriptions
          </span>
        }
      />

      {skipChatQuota() ? (
        <p className="mb-3 rounded-lg border border-tos-gold/25 bg-tos-gold/5 px-3 py-2 text-center text-[11px] text-tos-muted">
          Quota enforcement is disabled in this environment.
        </p>
      ) : null}

      {entitlement.isPaid ? (
        <GlassPanel glow="none" className="mb-4 p-4">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-white/80" aria-hidden />
            <p className="text-sm font-semibold text-white/90">
              You are on {entitlement.label}
              {entitlement.founderBadge && entitlement.plan !== "founder" ? " (Founder badge)" : ""}
            </p>
          </div>
          <p className="mt-1 text-xs text-tos-muted">
            {entitlement.plan === "free"
              ? "Legacy active period on file."
              : entitlement.plan === "founder"
                ? "Founder status is permanent — including Trading OS Founder pricing eligibility."
                : "Thank you for supporting AXE."}
          </p>
          <Link
            href="/chat"
            className="mt-3 inline-flex text-xs font-medium text-tos-muted hover:text-tos-text hover:underline"
          >
            ← Back to chat
          </Link>
        </GlassPanel>
      ) : null}

      <UpgradeTierGrid
        entitlement={entitlement}
        catalog={catalog}
        userId={userId}
        checkoutLinks={checkoutLinks}
        billingReady={billingReady}
      />

      <p className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center text-[10px] leading-relaxed text-tos-dim">
        {LEGAL_COPY.tradingShort} {LEGAL_COPY.pricing}
      </p>

      <p className="mt-4 px-1 text-center text-[10px] text-tos-dim">
        Questions? Visit{" "}
        <Link href="/settings" className="text-tos-muted underline-offset-2 hover:underline">
          Settings
        </Link>{" "}
        or return to{" "}
        <Link href="/chat" className="text-tos-muted underline-offset-2 hover:underline">
          Chat
        </Link>
        .
      </p>
    </div>
  );
}
