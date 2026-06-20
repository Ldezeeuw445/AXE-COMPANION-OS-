import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function UpgradeSuccessPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;
  const supabase = await createServerSupabaseClient();
  let label = "your plan";
  let isPaid = false;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ent = await getUserAxeEntitlement(supabase, user.id);
      label = ent.label;
      isPaid = ent.isPaid;
    }
  }

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
      <LiveStatusReporter liveCount={1} totalCount={1} label="Upgrade · success" allLiveOverride />
      <AxeTopBarInjector
        title="Upgrade"
        subtitle="Payment received"
        sections={[]}
        center={
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Upgrade
          </span>
        }
      />

      <GlassPanel className="mx-auto mt-6 max-w-md p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400/90" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-tos-text">Welcome aboard</h1>
        <p className="mt-2 text-sm leading-relaxed text-tos-muted">
          {isPaid
            ? `You're on ${label}. Full access is active.`
            : "Payment received — your plan usually activates within a minute once Stripe confirms."}
        </p>
        {sessionId ? (
          <p className="mt-2 font-mono text-[10px] text-tos-dim">Ref {sessionId.slice(0, 20)}…</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/chat" className="tos-btn-cyan inline-flex justify-center rounded-xl py-2.5 text-xs font-semibold">
            Open chat
          </Link>
          <Link
            href="/upgrade"
            className="inline-flex justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-xs font-semibold text-white/85 hover:bg-white/[0.07]"
          >
            View subscription
          </Link>
        </div>
      </GlassPanel>
    </div>
  );
}
