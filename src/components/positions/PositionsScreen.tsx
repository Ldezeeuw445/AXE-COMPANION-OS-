"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import type { OpenPositionRow, PendingOrderRow } from "@/lib/broker/loadPositionsPageData";
import { friendlyProviderStatus } from "@/lib/accounts/accountUiLabels";

type Props = {
  positions: OpenPositionRow[];
  pendingOrders: PendingOrderRow[];
  providerStatus: string | null;
  error: string | null;
  hint: string | null;
};

type Tab = "positions" | "orders";

function orderTypeLabel(type: string): { label: string; className: string } {
  switch (type) {
    case "buy_limit":
      return { label: "Buy Limit", className: "text-emerald-400 border-emerald-400/20 bg-emerald-400/10" };
    case "sell_limit":
      return { label: "Sell Limit", className: "text-rose-400 border-rose-400/20 bg-rose-400/10" };
    case "buy_stop":
      return { label: "Buy Stop", className: "text-emerald-400 border-emerald-400/20 bg-emerald-400/10" };
    case "sell_stop":
      return { label: "Sell Stop", className: "text-rose-400 border-rose-400/20 bg-rose-400/10" };
    default:
      return { label: type, className: "text-white/60 border-white/10 bg-white/5" };
  }
}

export function PositionsScreen({ positions, pendingOrders, providerStatus, error, hint }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("positions");

  const allLiveOverride: boolean | null =
    providerStatus === "connected"
      ? true
      : providerStatus === "failed"
        ? false
        : null;
  const totalCount = providerStatus ? 1 : 0;
  const liveCount = providerStatus === "connected" ? 1 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
      <LiveStatusReporter
        liveCount={liveCount}
        totalCount={totalCount}
        label="AXE MT5 Cloud positions"
        allLiveOverride={allLiveOverride}
      />
      <ScreenHeader
        title="Trade"
        subtitle="Open positions & pending orders from your MT5 terminal."
        left={<Layers className="h-6 w-6 text-white/60" aria-hidden />}
        right={providerStatus ? <Badge variant="long">{friendlyProviderStatus(providerStatus)}</Badge> : null}
      />

      {error ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
      {hint ? (
        <GlassPanel className="!p-3 text-xs leading-relaxed text-tos-muted">
          {hint}
          {!error && positions.length === 0 && pendingOrders.length === 0 ? (
            <span className="mt-2 block">
              <Link href="/accounts" className="text-white/70 hover:underline">
                Accounts
              </Link>{" "}
              ·{" "}
              <Link href="/chart" className="text-white/70 hover:underline">
                Chart
              </Link>
            </span>
          ) : null}
        </GlassPanel>
      ) : null}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        <button
          type="button"
          onClick={() => setActiveTab("positions")}
          className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-colors ${
            activeTab === "positions"
              ? "bg-white/[0.08] text-white shadow-sm"
              : "text-tos-muted hover:text-tos-text"
          }`}
        >
          Positions{positions.length > 0 ? ` (${positions.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-colors ${
            activeTab === "orders"
              ? "bg-white/[0.08] text-white shadow-sm"
              : "text-tos-muted hover:text-tos-text"
          }`}
        >
          Orders{pendingOrders.length > 0 ? ` (${pendingOrders.length})` : ""}
        </button>
      </div>

      {/* Positions tab */}
      {activeTab === "positions" ? (
        positions.length > 0 ? (
          <div className="space-y-2">
            {positions.map((p) => (
              <Link key={p.id} href={`/chart?symbol=${encodeURIComponent(p.symbol)}`}>
                <GlassPanel className="!p-3 transition-colors hover:border-white/[0.10]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-tos-text">{p.symbol}</span>
                    <span className={`text-sm font-medium ${(p.profit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {(p.profit ?? 0) >= 0 ? "+" : ""}{(p.profit ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-tos-dim">
                    <span className={`font-semibold capitalize ${p.side === "buy" ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                      {p.side}
                    </span>{" "}
                    · vol {p.volume}
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
        ) : (
          <p className="px-2 py-4 text-center text-xs text-tos-dim">No open positions</p>
        )
      ) : null}

      {/* Orders tab */}
      {activeTab === "orders" ? (
        pendingOrders.length > 0 ? (
          <div className="space-y-2">
            {pendingOrders.map((o) => {
              const badge = orderTypeLabel(o.type);
              return (
                <Link key={o.id} href={`/chart?symbol=${encodeURIComponent(o.symbol)}`}>
                  <GlassPanel className="!p-3 transition-colors hover:border-white/[0.10]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-tos-text">{o.symbol}</span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-tos-dim">
                      vol {o.volume} · price {o.openPrice}
                      {o.currentPrice != null ? ` · now ${o.currentPrice}` : ""}
                    </p>
                    <p className="mt-1 text-[10px] text-tos-dim">
                      SL {o.stopLoss ?? "—"} · TP {o.takeProfit ?? "—"}
                    </p>
                  </GlassPanel>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="px-2 py-4 text-center text-xs text-tos-dim">No pending orders</p>
        )
      ) : null}
    </div>
  );
}
