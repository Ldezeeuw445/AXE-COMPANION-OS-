import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { skipChatQuota } from "@/lib/chatQuota";
import { LEGAL_COPY } from "@/lib/legal/constants";

export default async function UpgradePage() {
  const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim() ?? "";
  const supabase = await createServerSupabaseClient();
  let isPro = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-6">
      <ScreenHeader left={<BrandMark />} title="Plans" subtitle="AXE Companion" />

      {skipChatQuota() ? (
        <p className="mb-3 rounded-lg border border-tos-gold/25 bg-tos-gold/5 px-3 py-2 text-center text-[11px] text-tos-muted">
          Quota enforcement is disabled in this environment (
          <code className="text-tos-gold/90">AXE_SKIP_CHAT_QUOTA</code>).
        </p>
      ) : null}

      {isPro ? (
        <GlassPanel className="mb-4 p-4">
          <p className="text-sm font-medium text-tos-accent-cyan">You are on Pro</p>
          <p className="mt-1 text-xs text-tos-muted">
            Unlimited chat sends (fair use). Thank you for supporting AXE.
          </p>
          <Link
            href="/chat"
            className="mt-4 inline-flex text-xs font-medium text-tos-muted hover:text-tos-text hover:underline"
          >
            ← Back to chat
          </Link>
        </GlassPanel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <GlassPanel className="p-4">
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">Free</h2>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-tos-text">€0</p>
          <ul className="mt-3 space-y-2 text-xs text-tos-muted">
            <li>Full product UX</li>
            <li>20 chat sends per day (UTC midnight reset)</li>
            <li>Each Send counts once, including tool rounds</li>
          </ul>
        </GlassPanel>

        <GlassPanel className="border-tos-accent-cyan/25 p-4 ring-1 ring-tos-accent-cyan/15">
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-accent-cyan">
            Pro
          </h2>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-tos-text">~€19/mo</p>
          <ul className="mt-3 space-y-2 text-xs text-tos-muted">
            <li>Unlimited sends (reasonable fair use)</li>
            <li>Same features as Free</li>
            <li>Billed via Stripe when checkout is configured</li>
          </ul>
          {paymentLink ? (
            <a
              href={paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="tos-btn-cyan mt-4 inline-flex w-full items-center justify-center rounded-xl py-2.5 text-xs font-semibold"
            >
              Upgrade with Stripe
            </a>
          ) : (
            <p className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-tos-dim">
              Checkout link not configured yet. Set{" "}
              <code className="text-tos-muted">NEXT_PUBLIC_STRIPE_PAYMENT_LINK</code>{" "}
              (Stripe Payment Link or Checkout URL) on the server, then redeploy.
            </p>
          )}
        </GlassPanel>
      </div>

      <p className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center text-[10px] leading-relaxed text-tos-dim">
        {LEGAL_COPY.tradingShort}{" "}
        {LEGAL_COPY.pricing}
      </p>

      <p className="mt-4 px-1 text-center text-[10px] text-tos-dim">
        Questions? Open{" "}
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
