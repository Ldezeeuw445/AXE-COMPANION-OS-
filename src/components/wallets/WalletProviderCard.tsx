"use client";

import { Plus, Check } from "lucide-react";
import type { WalletProviderMeta } from "@/lib/wallets/walletCatalog";
import { WalletBrandIcon } from "@/components/wallets/WalletBrandIcon";
import { cn } from "@/lib/utils";

type WalletProviderCardProps = {
  meta: WalletProviderMeta;
  trackedCount: number;
  onSelect: () => void;
};

export function WalletProviderCard({ meta, trackedCount, onSelect }: WalletProviderCardProps) {
  const connected = trackedCount > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex min-h-[7.5rem] flex-col items-start justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-br p-3.5 text-left transition-all",
        "hover:border-white/[0.14] hover:bg-white/[0.05] active:scale-[0.98]",
        meta.brandBg,
        connected ? meta.brandRing : "ring-1 ring-transparent",
        connected && "ring-1",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <WalletBrandIcon meta={meta} size="md" />
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200/90">
            <Check className="h-3 w-3" />
            {trackedCount}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/45 opacity-0 transition-opacity group-hover:opacity-100">
            <Plus className="h-3 w-3" />
            Add
          </span>
        )}
      </div>

      <div className="mt-3 min-w-0">
        <p className="truncate text-sm font-semibold text-white/92">{meta.name}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-white/50">{meta.subtitle}</p>
      </div>
    </button>
  );
}
