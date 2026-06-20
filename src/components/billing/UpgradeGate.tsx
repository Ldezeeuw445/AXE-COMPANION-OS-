import Link from "next/link";
import { Lock } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { AxeFeature } from "@/lib/billing/features";
import { requiredPlanLabelForFeature } from "@/lib/billing/features";

type Props = {
  feature: AxeFeature;
  title: string;
  description: string;
};

export function UpgradeGate({ feature, title, description }: Props) {
  const required = requiredPlanLabelForFeature(feature);
  return (
    <GlassPanel className="border-tos-warm/20 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
          <Lock className="h-4 w-4 text-tos-warm/90" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-warm/90">
            {required} feature
          </p>
          <p className="mt-1 text-sm font-medium text-tos-text">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-tos-muted">{description}</p>
          <Link
            href="/upgrade"
            className="tos-btn-cyan mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold"
          >
            View plans →
          </Link>
        </div>
      </div>
    </GlassPanel>
  );
}
