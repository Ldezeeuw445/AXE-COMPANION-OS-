"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { showFreePhoneGate } from "@/lib/billing/phoneAccess";
import { tierById, type AxePlanId } from "@/lib/billing/tiers";

/**
 * Free is desk only. A Free account that opens AXE Companion sees this instead
 * of the app, except on the pages it needs to upgrade or manage its account.
 */
export function FreePhoneGate({
  featurePlan,
  children,
}: {
  featurePlan: AxePlanId | "exempt" | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (!showFreePhoneGate(featurePlan, pathname)) return <>{children}</>;

  const core = tierById("core");
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-10" data-testid="free-phone-gate">
      <GlassPanel className="w-full max-w-md p-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
          <Smartphone className="h-5 w-5 text-cyan-300" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-white">AXE on your phone starts at Core</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Your Free plan includes Trading OS on your desk. AXE Companion on your phone comes with Core
          (€{core.priceEurMonthly}/month) and every plan above it — one subscription for both apps.
        </p>
        <div className="mt-5 grid gap-2">
          <Link
            href="/upgrade"
            className="rounded-full bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-300"
          >
            See plans
          </Link>
          <a
            href="https://www.tradingosapp.com/chart"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.06]"
          >
            <Monitor className="h-4 w-4" aria-hidden /> Open Trading OS on your desk
          </a>
        </div>
        <p className="mt-4 text-[11px] text-white/40">
          <Link href="/settings" className="underline-offset-2 hover:underline">
            Account settings
          </Link>
        </p>
      </GlassPanel>
    </div>
  );
}
