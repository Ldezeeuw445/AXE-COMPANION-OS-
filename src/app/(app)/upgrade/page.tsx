import Link from "next/link";
import { Check, Crown, Mail, Sparkles, Zap } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { skipChatQuota } from "@/lib/chatQuota";
import { LEGAL_COPY } from "@/lib/legal/constants";

const FREE_FEATURES = [
  "Full AXE Companion experience",
  "MT5 broker chart with live stream",
  "Journal, Vault and AXE memory",
  "20 chat sends per day (UTC reset)",
];

const PRO_FEATURES = [
  "Unlimited chat sends (fair use)",
  "AXE memory grows with you",
  "Weekly journal reviews",
  "Account intelligence + cockpit",
  "Priority on upcoming Trading OS terminal",
];

export default async function SubscriptionsPage() {
  const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim() ?? "";
  const billingConfigured = paymentLink.length > 0;
  const supabase = await createServerSupabaseClient();
  let isPro = false;
  let userId: string | null = null;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const { data } = await supabase
        .from("axe_user_entitlements")
        .select("plan, pro_until, chat_quota_exempt")
        .eq("user_id", user.id)
        .maybeSingle();
      const until = data?.pro_until ? new Date(data.pro_until) : null;
      isPro =
        data?.plan === "pro" ||
        (!!until && until > new Date()) ||
        data?.chat_quota_exempt === true;
    }
  }

  /**
   * Attach client_reference_id so the Stripe webhook can map this checkout
   * back to the auth.users row. Without it the webhook receives a session
   * with no user link and entitlement upsert is skipped.
   */
  const checkoutHref = (() => {
    if (!paymentLink || !userId) return paymentLink;
    try {
      const url = new URL(paymentLink);
      url.searchParams.set("client_reference_id", userId);
      return url.toString();
    } catch {
      // Fallback for plain string Payment Links — append manually.
      const sep = paymentLink.includes("?") ? "&" : "?";
      return `${paymentLink}${sep}client_reference_id=${encodeURIComponent(userId)}`;
    }
  })();

  const toolbarSections: AxeToolbarSection[] = [
    {
      id: "ask-axe",
      title: "Ask AXE",
      items: [
        {
          id: "pro",
          label: "What do I get on Pro?",
          description: "Clear value, no fluff",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · subscriptions]\nSummarize what changes if I upgrade to Pro. Keep it short and honest.",
          )}`,
        },
        {
          id: "quota",
          label: "How does chat quota work?",
          description: "Daily cap, reset, fair use",
          href: `/chat?q=${encodeURIComponent(
            "[AXE · quota]\nExplain the Free chat quota (20/day) and what 'fair use' means on Pro.",
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

  // Pulse: green when Stripe link + Supabase entitlement read both
  // succeeded. Both are required for upgrade to actually work.
  const upgradeReady = Boolean(supabase) && billingConfigured;

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col pb-6">
      <LiveStatusReporter
        liveCount={(supabase ? 1 : 0) + (billingConfigured ? 1 : 0)}
        totalCount={2}
        label={`Subscriptions · ${isPro ? "Pro" : "Free"}`}
        allLiveOverride={upgradeReady ? true : false}
      />
      <AxeTopBarInjector title="Subscriptions" subtitle={isPro ? "You’re on Pro" : "Free → Pro"} sections={toolbarSections} center={<span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Subscriptions</span>} />

      {skipChatQuota() ? (
        <p className="mb-3 rounded-lg border border-tos-gold/25 bg-tos-gold/5 px-3 py-2 text-center text-[11px] text-tos-muted">
          Quota enforcement is disabled in this environment.
        </p>
      ) : null}

      {isPro ? (
        <GlassPanel glow="none" className="mb-4 p-4">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-white/80" aria-hidden />
            <p className="text-sm font-semibold text-white/90">You are on Pro</p>
          </div>
          <p className="mt-1 text-xs text-tos-muted">
            Unlimited chat sends (fair use). Thank you for supporting AXE.
          </p>
          <Link
            href="/chat"
            className="mt-3 inline-flex text-xs font-medium text-tos-muted hover:text-tos-text hover:underline"
          >
            ← Back to chat
          </Link>
        </GlassPanel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <GlassPanel className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">Free</h2>
            <Badge variant="neutral">Current</Badge>
          </div>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-tos-text">€0</p>
          <p className="mt-1 text-[11px] text-tos-dim">No card required.</p>
          <ul className="mt-4 space-y-2 text-xs text-tos-muted">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/85" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </GlassPanel>

        <GlassPanel
          glow="none"
          className="relative overflow-hidden border-white/[0.08] p-5 ring-1 ring-white/[0.08]"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">Pro</h2>
            <Badge variant="long">Recommended</Badge>
          </div>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-tos-text">
            €19<span className="text-base text-tos-muted">/mo</span>
          </p>
          <p className="mt-1 text-[11px] text-tos-dim">Cancel anytime, prices may exclude VAT.</p>
          <ul className="mt-4 space-y-2 text-xs text-tos-muted">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {billingConfigured && userId ? (
            <a
              href={checkoutHref}
              target="_blank"
              rel="noopener noreferrer"
              className="tos-btn-cyan mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold"
            >
              <Zap className="h-3.5 w-3.5" />
              Upgrade to Pro
            </a>
          ) : billingConfigured ? (
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200/95">
              Sign in first — Pro is linked to your account.
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200/95">
                Pro checkout is being prepared.
              </div>
              <Link
                href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@tradingosapp.com"}?subject=AXE%20Pro%20waitlist`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.05] py-2.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/[0.08]"
              >
                <Mail className="h-3.5 w-3.5" />
                Notify me when Pro opens
              </Link>
            </div>
          )}
        </GlassPanel>
      </div>

      <GlassPanel className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">
            Trading OS terminal · upcoming
          </h3>
          <Badge variant="warm">Same Supabase</Badge>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-tos-muted">
          Trading OS is the upcoming premium terminal powered by the same AXE brain — charts, workspace
          intelligence, alerts, execution review and multi-source market context. AXE Companion is the
          mobile command layer today; your account, memory and journal carry over when the terminal ships.
        </p>
      </GlassPanel>

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
