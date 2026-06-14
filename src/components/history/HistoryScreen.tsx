"use client";

/**
 * HistoryScreen — MT5-native History tab.
 *
 * Three sub-tabs: Positions · Orders · Deals
 * Compact trade rows:  SYMBOL  side vol         PnL
 *                      entry → exit        timestamp
 * Summary footer: Profit / Commission / Balance
 * Filter panel hidden behind a small filter icon.
 */

import { useRouter } from "next/navigation";
import { useState, useMemo, useTransition } from "react";
import { Filter, X } from "lucide-react";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { setLiveStatus, clearLiveStatusScope } from "@/lib/liveStatusBus";
import { useEffect } from "react";
import type {
  BrokerTradeRow,
  HistoryDealRow,
  HistoryOrderRow,
  HistoryPageData,
  HistorySummary,
} from "@/lib/broker/loadHistoryPageData";

/* ── Props ─────────────────────────────────────────────────────────── */
type HistoryTab = "positions" | "orders" | "deals";
type Props = Omit<HistoryPageData, "error"> & { loadError: string | null };

/* ── Helpers ───────────────────────────────────────────────────────── */
function fmtPrice(n: number | null, digits = 2) {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPnl(n: number) {
  const s = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n > 0 ? `+${s}` : s;
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const mon = d.toLocaleString(undefined, { month: "short" });
    const day = d.getDate();
    return `${hh}:${mm}  ${day} ${mon}`;
  } catch {
    return "";
  }
}

/** Guess decimal digits from the price magnitude. */
function priceDigits(p: number | null): number {
  if (!p) return 2;
  if (p > 100) return 2;   // Gold, indices
  if (p > 10) return 3;
  return 5;                 // Forex
}

/* ── Main Component ────────────────────────────────────────────────── */
export function HistoryScreen({
  accounts,
  activeAccountId,
  selectedAccountId,
  trades,
  orders,
  deals,
  summary,
  filters,
  historyHint,
  loadError,
}: Props) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [tab, setTab] = useState<HistoryTab>("positions");
  const [showFilter, setShowFilter] = useState(false);

  const hasActiveFilters = !!(filters.symbol || filters.from || filters.to);

  // Live-status reporter
  useEffect(() => {
    setLiveStatus({
      allLive: loadError ? false : null,
      liveCount: loadError ? 0 : 1,
      totalCount: 1,
      freshestAgeSec: null,
      label: `History · ${trades.length} trades`,
      severity: loadError ? "degraded" : trades.length > 0 ? "fresh" : "inactive",
      reason: loadError
        ? "History ledger could not load."
        : trades.length > 0
          ? "Broker trade history loaded."
          : "No broker trade history yet.",
      scope: "history",
    });
    return () => clearLiveStatusScope("history");
  }, [loadError, trades.length]);

  /* ── URL builder for filter navigation ─────────────────────────── */
  function buildUrl(next: {
    account?: string | null;
    symbol?: string;
    from?: string;
    to?: string;
  }) {
    const p = new URLSearchParams();
    const acc = next.account !== undefined ? next.account : selectedAccountId;
    if (acc) p.set("account", acc);
    const sym = next.symbol !== undefined ? next.symbol : filters.symbol;
    if (sym) p.set("symbol", sym);
    const from = next.from !== undefined ? next.from : filters.from;
    if (from) p.set("from", from);
    const to = next.to !== undefined ? next.to : filters.to;
    if (to) p.set("to", to);
    const qs = p.toString();
    return qs ? `/history?${qs}` : "/history";
  }

  /* ── Summary totals ────────────────────────────────────────────── */
  const totalProfit = summary?.totalPnl ?? 0;
  const totalFees = useMemo(
    () => trades.reduce((s, t) => s + t.fees, 0),
    [trades],
  );

  /* ── No account selected ───────────────────────────────────────── */
  if (!selectedAccountId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <PageTitleInjector title="History" />
        <p className="text-sm text-tos-muted">
          {accounts.length === 0
            ? "Connect a broker account to view trade history."
            : "Select an account to view history."}
        </p>
        {accounts.length > 0 && (
          <select
            className="mt-2 rounded-lg border border-white/10 bg-[#0c0c0f] px-3 py-2 text-sm text-tos-text"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                startNav(() =>
                  router.push(`/history?account=${encodeURIComponent(e.target.value)}`),
                );
              }
            }}
          >
            <option value="" disabled>
              Choose account…
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-2">
      <PageTitleInjector title="History" />

      {loadError && (
        <p className="mx-4 mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {loadError}
        </p>
      )}

      {/* ── Tab bar + filter icon ─────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 pb-2">
        {(["positions", "orders", "deals"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              tab === t
                ? "bg-white/[0.08] text-white"
                : "text-white/30 hover:text-white/50"
            }`}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowFilter((v) => !v)}
          className={`ml-1 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            showFilter || hasActiveFilters
              ? "bg-white/[0.08] text-white"
              : "text-white/30 hover:text-white/50"
          }`}
          aria-label="Filter"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Collapsible filter row ────────────────────────────────── */}
      {showFilter && (
        <form
          className="mx-3 mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          action="/history"
          method="get"
        >
          {selectedAccountId && (
            <input type="hidden" name="account" value={selectedAccountId} />
          )}
          {/* Account switcher */}
          {accounts.length > 1 && (
            <label className="flex flex-col gap-0.5 text-[10px] text-white/40">
              Account
              <select
                name="account"
                className="rounded border border-white/10 bg-[#0c0c0f] px-2 py-1.5 text-xs text-tos-text"
                defaultValue={selectedAccountId}
                disabled={navPending}
                onChange={(e) => {
                  startNav(() =>
                    router.push(buildUrl({ account: e.target.value || null })),
                  );
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}{a.id === activeAccountId ? " ✦" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-0.5 text-[10px] text-white/40">
            Symbol
            <input
              name="symbol"
              type="text"
              placeholder="XAUUSD"
              defaultValue={filters.symbol}
              className="w-24 rounded border border-white/10 bg-[#0c0c0f] px-2 py-1.5 text-xs text-tos-text placeholder:text-white/20"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-white/40">
            From
            <input
              name="from"
              type="date"
              defaultValue={filters.from}
              className="rounded border border-white/10 bg-[#0c0c0f] px-2 py-1.5 text-xs text-tos-text"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-white/40">
            To
            <input
              name="to"
              type="date"
              defaultValue={filters.to}
              className="rounded border border-white/10 bg-[#0c0c0f] px-2 py-1.5 text-xs text-tos-text"
            />
          </label>
          <div className="flex gap-1.5">
            <button
              type="submit"
              className="rounded bg-white/[0.08] px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-white/[0.12]"
              disabled={navPending}
            >
              Apply
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                className="rounded px-2 py-1.5 text-[10px] text-white/40 hover:text-white/60"
                onClick={() =>
                  startNav(() =>
                    router.push(
                      selectedAccountId
                        ? `/history?account=${encodeURIComponent(selectedAccountId)}`
                        : "/history",
                    ),
                  )
                }
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </form>
      )}

      {/* ── Tab content ───────────────────────────────────────────── */}
      {tab === "positions" && (
        <PositionsTab
          trades={trades}
          totalProfit={totalProfit}
          totalFees={totalFees}
          summary={summary}
        />
      )}
      {tab === "orders" && (
        <OrdersTab orders={orders} hint={historyHint} />
      )}
      {tab === "deals" && (
        <DealsTab deals={deals} hint={historyHint} />
      )}
    </div>
  );
}

/* ── Positions Tab ─────────────────────────────────────────────────── */
function PositionsTab({
  trades,
  totalProfit,
  totalFees,
  summary,
}: {
  trades: BrokerTradeRow[];
  totalProfit: number;
  totalFees: number;
  summary: HistorySummary | null;
}) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-xs text-white/25">No closed positions yet</p>
      </div>
    );
  }

  const balance = totalProfit - Math.abs(totalFees);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scrollable trade list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Balance header row */}
        <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2.5">
          <span className="text-[11px] font-medium text-white/40">Balance</span>
          <span
            className={`font-mono text-sm font-bold tabular-nums ${
              totalProfit >= 0 ? "text-cyan-400" : "text-rose-400"
            }`}
          >
            {fmtPnl(totalProfit)}
          </span>
        </div>

        {/* Trade rows */}
        {trades.map((t, i) => {
          const digits = priceDigits(t.openPrice);
          const pnlColor =
            t.pnl > 0
              ? "text-cyan-400"
              : t.pnl < 0
                ? "text-rose-400"
                : "text-white/40";
          const sideColor =
            t.side === "buy" ? "text-cyan-400/80" : "text-rose-400/80";

          return (
            <div
              key={t.id}
              className={`border-b border-white/[0.04] px-4 py-2.5 ${
                i % 2 === 1 ? "bg-white/[0.015]" : ""
              }`}
            >
              {/* Row 1: symbol  side  vol  ·····  PnL */}
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="font-mono text-[12px] font-semibold text-white">
                    {t.symbol}
                  </span>
                  <span className={`text-[10px] font-medium capitalize ${sideColor}`}>
                    {t.side}
                  </span>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {fmtPrice(t.volume, 2)}
                  </span>
                </div>
                <span className={`font-mono text-[12px] font-bold tabular-nums shrink-0 ${pnlColor}`}>
                  {fmtPnl(t.pnl)}
                </span>
              </div>
              {/* Row 2: entry → exit  ·····  timestamp */}
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="text-[10px] text-white/25 tabular-nums">
                  {fmtPrice(t.openPrice, digits)} → {fmtPrice(t.closePrice, digits)}
                </span>
                <span className="text-[10px] text-white/20 shrink-0 tabular-nums">
                  {fmtTime(t.closeTime)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Summary footer ────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.08] bg-[#0a0a0e] px-4 py-2.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/30">Profit</span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              totalProfit >= 0 ? "text-cyan-400" : "text-rose-400"
            }`}
          >
            {fmtPnl(totalProfit)}
          </span>
        </div>
        {totalFees !== 0 && (
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-white/30">Commission</span>
            <span className="font-mono tabular-nums text-white/40">
              {fmtPnl(-Math.abs(totalFees))}
            </span>
          </div>
        )}
        {summary && (
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-white/30">
              {summary.totalTrades} trades · {summary.wins}W / {summary.losses}L
            </span>
            <span className="font-mono tabular-nums text-white/30">
              {(summary.winRate * 100).toFixed(0)}% win
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Orders Tab ────────────────────────────────────────────────────── */
function OrdersTab({ orders, hint }: { orders: HistoryOrderRow[]; hint: string | null }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-xs text-white/25">
          {hint ?? "No order history in this range"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {orders.map((o, i) => (
        <div
          key={o.id}
          className={`border-b border-white/[0.04] px-4 py-2.5 ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="font-mono text-[12px] font-semibold text-white">{o.symbol}</span>
              <span className="text-[10px] font-medium capitalize text-white/45">{o.type}</span>
              <span className="text-[10px] tabular-nums text-white/30">{fmtPrice(o.volume, 2)}</span>
            </div>
            <span className="shrink-0 text-[10px] capitalize text-white/35">{o.state}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="text-[10px] tabular-nums text-white/25">
              @ {fmtPrice(o.openPrice, priceDigits(o.openPrice))}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-white/20">{fmtTime(o.doneTime)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Deals Tab ─────────────────────────────────────────────────────── */
function DealsTab({ deals, hint }: { deals: HistoryDealRow[]; hint: string | null }) {
  if (deals.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-xs text-white/25">
          {hint ?? "No deal history in this range"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {deals.map((d, i) => {
        const pnlColor =
          d.profit > 0 ? "text-cyan-400" : d.profit < 0 ? "text-rose-400" : "text-white/40";
        return (
          <div
            key={d.id}
            className={`border-b border-white/[0.04] px-4 py-2.5 ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <span className="font-mono text-[12px] font-semibold text-white">{d.symbol}</span>
                <span className="text-[10px] capitalize text-white/40">{d.type}</span>
                {d.entryType ? (
                  <span className="text-[10px] capitalize text-white/25">{d.entryType}</span>
                ) : null}
                <span className="text-[10px] tabular-nums text-white/30">{fmtPrice(d.volume, 2)}</span>
              </div>
              <span className={`font-mono text-[12px] font-bold tabular-nums shrink-0 ${pnlColor}`}>
                {fmtPnl(d.profit)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="text-[10px] tabular-nums text-white/25">
                @ {fmtPrice(d.price, priceDigits(d.price))}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-white/20">{fmtTime(d.time)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
