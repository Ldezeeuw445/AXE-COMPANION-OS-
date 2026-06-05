"use client";

/**
 * PositionsScreen — MT5-style Trade tab.
 *
 * Top section: Balance / Equity / Margin / Free Margin / Margin Level %
 * Two sub-tabs: Positions · Orders
 * Compact position rows matching MT5 layout.
 */

import { useState } from "react";
import Link from "next/link";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import type { OpenPositionRow, PendingOrderRow, AccountSummary } from "@/lib/broker/loadPositionsPageData";

type Props = {
  positions: OpenPositionRow[];
  pendingOrders: PendingOrderRow[];
  accountSummary: AccountSummary | null;
  providerStatus: string | null;
  error: string | null;
  hint: string | null;
};

type Tab = "positions" | "orders";

/* ── Helpers ───────────────────────────────────────────────────────── */
function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPnl(n: number) {
  const s = fmtMoney(n);
  return n > 0 ? `+${s}` : s;
}

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

function priceDigits(p: number | null): number {
  if (!p) return 2;
  if (p > 100) return 2;
  if (p > 10) return 3;
  return 5;
}

function fmtPrice(n: number | null, digits = 2) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/* ── Main Component ────────────────────────────────────────────────── */
export function PositionsScreen({
  positions,
  pendingOrders,
  accountSummary,
  providerStatus,
  error,
  hint,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("positions");

  const allLiveOverride: boolean | null =
    providerStatus === "connected" ? true : providerStatus === "failed" ? false : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-2">
      <LiveStatusReporter
        liveCount={providerStatus === "connected" ? 1 : 0}
        totalCount={providerStatus ? 1 : 0}
        label="AXE MT5 Cloud positions"
        allLiveOverride={allLiveOverride}
      />
      <PageTitleInjector title="Trade" />

      {error && (
        <p className="mx-4 mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* ── Account summary bar (MT5 style) ────────────────────────── */}
      {accountSummary && (
        <div className="mx-3 mb-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <AccountMetric label="Balance" value={fmtMoney(accountSummary.balance)} />
          <AccountMetric label="Equity" value={fmtMoney(accountSummary.equity)} />
          <AccountMetric label="Margin" value={fmtMoney(accountSummary.margin)} />
          <AccountMetric label="Free Margin" value={fmtMoney(accountSummary.freeMargin)} />
          <AccountMetric label="Margin Level" value={fmtPct(accountSummary.marginLevel)} />
        </div>
      )}

      {hint && !error && positions.length === 0 && pendingOrders.length === 0 && (
        <div className="mx-4 mb-2 text-xs text-white/30">
          {hint}{" "}
          <Link href="/accounts" className="text-white/50 hover:underline">Accounts</Link>
          {" · "}
          <Link href="/chart" className="text-white/50 hover:underline">Chart</Link>
        </div>
      )}

      {/* ── Tab switcher ───────────────────────────────────────────── */}
      <div className="flex gap-1 px-3 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("positions")}
          className={`flex-1 rounded-lg py-2 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            activeTab === "positions"
              ? "bg-white/[0.08] text-white"
              : "text-white/30 hover:text-white/50"
          }`}
        >
          Positions{positions.length > 0 ? ` (${positions.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`flex-1 rounded-lg py-2 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            activeTab === "orders"
              ? "bg-white/[0.08] text-white"
              : "text-white/30 hover:text-white/50"
          }`}
        >
          Orders{pendingOrders.length > 0 ? ` (${pendingOrders.length})` : ""}
        </button>
      </div>

      {/* ── Positions tab ──────────────────────────────────────────── */}
      {activeTab === "positions" && (
        positions.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {positions.map((p, i) => {
              const digits = priceDigits(p.openPrice);
              const pnl = p.profit ?? 0;
              const pnlColor =
                pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-rose-400" : "text-white/40";
              const sideColor = p.side === "buy" ? "text-emerald-400/80" : "text-rose-400/80";

              return (
                <Link
                  key={p.id}
                  href={`/chart?symbol=${encodeURIComponent(p.symbol)}`}
                  className={`block border-b border-white/[0.04] px-4 py-2.5 active:bg-white/[0.04] ${
                    i % 2 === 1 ? "bg-white/[0.015]" : ""
                  }`}
                >
                  {/* Row 1: symbol  side  vol  ·····  P&L */}
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="font-mono text-[12px] font-semibold text-white">
                        {p.symbol}
                      </span>
                      <span className={`text-[10px] font-medium capitalize ${sideColor}`}>
                        {p.side}
                      </span>
                      <span className="text-[10px] text-white/30 tabular-nums">
                        {fmtPrice(p.volume, 2)}
                      </span>
                    </div>
                    <span className={`font-mono text-[12px] font-bold tabular-nums shrink-0 ${pnlColor}`}>
                      {fmtPnl(pnl)}
                    </span>
                  </div>
                  {/* Row 2: entry → now  SL · TP */}
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-white/25 tabular-nums">
                      {fmtPrice(p.openPrice, digits)} → {fmtPrice(p.currentPrice, digits)}
                    </span>
                    <span className="text-[10px] text-white/20 shrink-0 tabular-nums">
                      SL {p.stopLoss != null ? fmtPrice(p.stopLoss, digits) : "—"} · TP {p.takeProfit != null ? fmtPrice(p.takeProfit, digits) : "—"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-white/25">No open positions</p>
          </div>
        )
      )}

      {/* ── Orders tab ─────────────────────────────────────────────── */}
      {activeTab === "orders" && (
        pendingOrders.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pendingOrders.map((o, i) => {
              const digits = priceDigits(o.openPrice);
              const isBuy = o.type.includes("buy");
              const typeColor = isBuy ? "text-emerald-400/80" : "text-rose-400/80";
              const typeLabel = o.type.replace("_", " ");

              return (
                <Link
                  key={o.id}
                  href={`/chart?symbol=${encodeURIComponent(o.symbol)}`}
                  className={`block border-b border-white/[0.04] px-4 py-2.5 active:bg-white/[0.04] ${
                    i % 2 === 1 ? "bg-white/[0.015]" : ""
                  }`}
                >
                  {/* Row 1: symbol  type  vol */}
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="font-mono text-[12px] font-semibold text-white">
                        {o.symbol}
                      </span>
                      <span className={`text-[10px] font-medium capitalize ${typeColor}`}>
                        {typeLabel}
                      </span>
                      <span className="text-[10px] text-white/30 tabular-nums">
                        {fmtPrice(o.volume, 2)}
                      </span>
                    </div>
                  </div>
                  {/* Row 2: price  SL · TP */}
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-white/25 tabular-nums">
                      @ {fmtPrice(o.openPrice, digits)}
                      {o.currentPrice != null ? ` · now ${fmtPrice(o.currentPrice, digits)}` : ""}
                    </span>
                    <span className="text-[10px] text-white/20 shrink-0 tabular-nums">
                      SL {o.stopLoss != null ? fmtPrice(o.stopLoss, digits) : "—"} · TP {o.takeProfit != null ? fmtPrice(o.takeProfit, digits) : "—"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-white/25">No pending orders</p>
          </div>
        )
      )}
    </div>
  );
}

/* ── Account Metric (small helper) ─────────────────────────────────── */
function AccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-[9px] uppercase tracking-wider text-white/25">{label}</span>
      <p className="font-mono text-[11px] font-semibold tabular-nums text-white/70">{value}</p>
    </div>
  );
}
