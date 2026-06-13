"use client";

import Link from "next/link";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import type { OpenPositionRow } from "@/lib/broker/loadPositionsPageData";

type Props = {
  positions: OpenPositionRow[];
  providerStatus: string | null;
  error: string | null;
  hint: string | null;
};

export function PositionsScreen({ positions, providerStatus, error, hint }: Props) {
  // Honest live mapping for the AXE pulse:
  //  • "connected" → green pulse (MetaApi is delivering)
  //  • "failed"    → amber (provider configured but failing)
  //  • anything else (provider_not_configured / no active account) → no opinion
  const allLiveOverride: boolean | null =
    providerStatus === "connected"
      ? true
      : providerStatus === "failed"
        ? false
        : null;
  const totalCount = providerStatus ? 1 : 0;
  const liveCount = providerStatus === "connected" ? 1 : 0;

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain pb-2">
      <LiveStatusReporter
        liveCount={liveCount}
        totalCount={totalCount}
        label="MetaApi positions"
        allLiveOverride={allLiveOverride}
      />
      <PageTitleInjector title="Trade" />

      {error ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
      {hint ? (
        <GlassPanel className="!p-3 text-xs leading-relaxed text-tos-muted">
          {hint}
          {!error && !positions.length ? (
            <span className="mt-2 block">
              <Link href="/accounts" className="text-cyan-400 hover:underline">
                Accounts
              </Link>{" "}
              ·{" "}
              <Link href="/chart" className="text-cyan-400 hover:underline">
                Chart
              </Link>
            </span>
          ) : null}
        </GlassPanel>
      ) : null}

      {positions.length > 0 ? (
        <div className="space-y-2">
          {positions.map((p) => (
            <Link key={p.id} href={`/chart?symbol=${encodeURIComponent(p.symbol)}`}>
              <GlassPanel className="!p-3 transition-colors hover:border-cyan-500/20">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-tos-text">{p.symbol}</span>
                  <span className={`text-sm font-medium ${(p.profit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {(p.profit ?? 0).toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-tos-dim">
                  <span className="capitalize">{p.side}</span> · vol {p.volume}
                  {p.openPrice != null ? ` · entry ${p.openPrice}` : ""}
                  {p.currentPrice != null ? ` · now ${p.currentPrice}` : ""}
                </p>
                <p className="mt-1 text-[10px] text-tos-dim">
                  SL {p.stopLoss ?? "—"} · TP {p.takeProfit ?? "—"}
                </p>
              </GlassPanel>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
