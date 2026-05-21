"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useTransition } from "react";
import { Landmark } from "lucide-react";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { setLiveStatus, clearLiveStatusScope } from "@/lib/liveStatusBus";
import type {
  BrokerTradeRow,
  HistoryPageData,
  HistorySummary,
} from "@/lib/broker/loadHistoryPageData";

type Props = Omit<HistoryPageData, "error"> & { loadError: string | null };

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatNum(n: number | null, digits = 2) {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPnl(n: number) {
  const s = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n > 0) return `+${s}`;
  return s;
}

function SummaryStrip({ s }: { s: HistorySummary }) {
  const pct = (s.winRate * 100).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <GlassPanel className="!p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-tos-muted">
          Trades
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-tos-text">
          {s.totalTrades}
        </p>
      </GlassPanel>
      <GlassPanel className="!p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-tos-muted">
          Total PnL
        </p>
        <p
          className={`mt-1 text-lg font-semibold tabular-nums ${
            s.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {formatPnl(s.totalPnl)}
        </p>
      </GlassPanel>
      <GlassPanel className="!p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-tos-muted">
          Win rate
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-tos-text">
          {s.wins + s.losses > 0 ? `${pct}%` : "—"}
        </p>
      </GlassPanel>
      <GlassPanel className="!p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-tos-muted">
          Avg win / loss
        </p>
        <p className="mt-1 text-xs font-medium tabular-nums leading-snug text-tos-text">
          <span className="text-emerald-400/90">
            {s.avgWin != null ? formatPnl(s.avgWin) : "—"}
          </span>
          <span className="text-tos-muted"> / </span>
          <span className="text-rose-400/90">
            {s.avgLoss != null ? formatNum(s.avgLoss, 2) : "—"}
          </span>
        </p>
      </GlassPanel>
    </div>
  );
}

export function HistoryScreen({
  accounts,
  activeAccountId,
  selectedAccountId,
  trades,
  summary,
  filters,
  loadError,
}: Props) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const selectedLabel = useMemo(() => {
    if (!selectedAccountId) return null;
    const a = accounts.find((x) => x.id === selectedAccountId);
    return a?.label ?? selectedAccountId.slice(0, 8);
  }, [accounts, selectedAccountId]);

  const isActiveChip =
    selectedAccountId &&
    activeAccountId &&
    selectedAccountId === activeAccountId;

  // History is an authenticated Supabase snapshot, not a live stream.
  // Keep the top pulse honest: loaded data is available, but not LIVE.
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
          ? "Broker trade history loaded from Supabase."
          : "No broker trade history sample yet.",
      scope: "history",
    });
    return () => clearLiveStatusScope("history");
  }, [loadError, trades.length]);

  function buildHistoryUrl(next: {
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

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-4 pb-4">
      <PageTitleInjector title="History" />

      {loadError ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      ) : null}

      {!selectedAccountId ? (
        <GlassPanel className="flex flex-col items-center gap-3 !py-10 text-center">
          <Landmark className="h-10 w-10 text-tos-muted/60" aria-hidden />
          <p className="max-w-xs text-sm text-tos-muted">
            {accounts.length === 0
              ? "Add a broker account on Accounts and set it active (or pick one below when you have accounts)."
              : "Select an account first — set your active account on Accounts, or pick one below."}
          </p>
          <Link
            href="/accounts"
            className="rounded-xl bg-tos-warm/20 px-4 py-2 text-sm font-medium text-tos-warm hover:bg-tos-warm/30"
          >
            Open accounts
          </Link>
          {accounts.length > 0 ? (
            <form
              className="mt-2 flex w-full max-w-sm flex-col gap-2"
              action="/history"
              method="get"
            >
              <label className="text-left text-[11px] text-tos-muted">
                Or view history for
                <select
                  name="account"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-tos-bg/80 px-3 py-2 text-sm text-tos-text"
                  defaultValue=""
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
              </label>
              <button
                type="submit"
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-tos-text hover:bg-white/15"
              >
                Show history
              </button>
            </form>
          ) : null}
        </GlassPanel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {selectedLabel ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-tos-text">
                <span className="font-medium">{selectedLabel}</span>
                {isActiveChip ? (
                  <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] text-tos-muted">Viewing</span>
                )}
              </span>
            ) : null}
          </div>

          <GlassPanel className="!p-3">
            <form className="flex flex-col gap-3" action="/history" method="get">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-[11px] text-tos-muted">
                  Account
                  <select
                    name="account"
                    className="rounded-lg border border-white/10 bg-tos-bg/80 px-2 py-2 text-sm text-tos-text"
                    defaultValue={selectedAccountId}
                    disabled={navPending}
                    onChange={(e) => {
                      const v = e.target.value;
                      startNav(() => {
                        router.push(
                          buildHistoryUrl({
                            account: v || null,
                          }),
                        );
                      });
                    }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                        {a.id === activeAccountId ? " (active)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-tos-muted">
                  Symbol
                  <input
                    name="symbol"
                    type="text"
                    placeholder="e.g. XAUUSD"
                    defaultValue={filters.symbol}
                    className="rounded-lg border border-white/10 bg-tos-bg/80 px-2 py-2 text-sm text-tos-text placeholder:text-tos-muted/50"
                    disabled={navPending}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-tos-muted">
                  From (close)
                  <input
                    name="from"
                    type="date"
                    defaultValue={filters.from}
                    className="rounded-lg border border-white/10 bg-tos-bg/80 px-2 py-2 text-sm text-tos-text"
                    disabled={navPending}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-tos-muted">
                  To (close)
                  <input
                    name="to"
                    type="date"
                    defaultValue={filters.to}
                    className="rounded-lg border border-white/10 bg-tos-bg/80 px-2 py-2 text-sm text-tos-text"
                    disabled={navPending}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-xl bg-tos-warm/20 px-4 py-2 text-sm font-medium text-tos-warm hover:bg-tos-warm/30 disabled:opacity-50"
                  disabled={navPending}
                >
                  Apply filters
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-tos-muted hover:bg-white/5"
                  disabled={navPending}
                  onClick={() =>
                    startNav(() => {
                      router.push(
                        selectedAccountId
                          ? `/history?account=${encodeURIComponent(selectedAccountId)}`
                          : "/history",
                      );
                    })
                  }
                >
                  Clear symbol & dates
                </button>
              </div>
            </form>
          </GlassPanel>

          {summary ? <SummaryStrip s={summary} /> : null}

          {trades.length === 0 ? (
            <GlassPanel className="!py-12 text-center text-sm text-tos-muted">
              No trades synced yet — when MT5 posts fills to your link token,
              they appear here automatically.
            </GlassPanel>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.08] bg-tos-surface-928/40">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-white/10 bg-tos-bg/95 backdrop-blur">
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-tos-muted">
                    <th className="px-2 py-2">Symbol</th>
                    <th className="px-2 py-2">Side</th>
                    <th className="px-2 py-2">Vol</th>
                    <th className="px-2 py-2">Open</th>
                    <th className="px-2 py-2">Close</th>
                    <th className="px-2 py-2">Open px</th>
                    <th className="px-2 py-2">Close px</th>
                    <th className="px-2 py-2">PnL</th>
                    <th className="px-2 py-2">Fees</th>
                    <th className="px-2 py-2">Journal</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t: BrokerTradeRow) => (
                    <tr
                      key={t.id}
                      className="border-b border-white/[0.05] text-tos-text hover:bg-white/[0.03]"
                    >
                      <td className="px-2 py-2 font-medium">{t.symbol}</td>
                      <td className="px-2 py-2 capitalize">{t.side}</td>
                      <td className="px-2 py-2 tabular-nums">{formatNum(t.volume, 2)}</td>
                      <td className="px-2 py-2 text-tos-muted">
                        {formatDateTime(t.openTime)}
                      </td>
                      <td className="px-2 py-2 text-tos-muted">
                        {formatDateTime(t.closeTime)}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-tos-muted">
                        {formatNum(t.openPrice, 5)}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-tos-muted">
                        {formatNum(t.closePrice, 5)}
                      </td>
                      <td
                        className={`px-2 py-2 tabular-nums font-medium ${
                          t.pnl > 0
                            ? "text-emerald-400"
                            : t.pnl < 0
                              ? "text-rose-400"
                              : "text-tos-muted"
                        }`}
                      >
                        {formatPnl(t.pnl)}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-tos-muted">
                        {formatNum(t.fees, 2)}
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/journal?trade=${encodeURIComponent(t.id)}&account=${encodeURIComponent(t.accountId)}`}
                          className="text-tos-warm hover:underline"
                          prefetch={false}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
