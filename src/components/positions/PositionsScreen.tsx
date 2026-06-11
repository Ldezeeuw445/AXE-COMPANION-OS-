"use client";

/**
 * PositionsScreen — MT5-style Trade tab.
 *
 * Top section: Balance / Equity / Margin / Free Margin / Margin Level %
 * Two sub-tabs: Positions · Orders
 * Compact position rows with swipe-to-close / close button.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { useAmbient } from "@/components/ambient/AmbientProvider";
import type { OpenPositionRow, PendingOrderRow, AccountSummary } from "@/lib/broker/loadPositionsPageData";

type Props = {
  positions: OpenPositionRow[];
  pendingOrders: PendingOrderRow[];
  accountSummary: AccountSummary | null;
  providerStatus: string | null;
  error: string | null;
  hint: string | null;
  brokerAccountId: string | null;
};

type Tab = "positions" | "orders";

type CloseState = {
  positionId: string;
  status: "confirm" | "closing" | "success" | "error";
  errorMsg?: string;
};

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
  brokerAccountId,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("positions");
  const [closeState, setCloseState] = useState<CloseState | null>(null);
  const router = useRouter();
  const { playSound, vibrate } = useAmbient();

  const allLiveOverride: boolean | null =
    providerStatus === "connected" ? true : providerStatus === "failed" ? false : null;

  /* ── Close trade handler ──────────────────────────────────────── */
  const handleCloseRequest = useCallback((positionId: string) => {
    vibrate("medium");
    playSound("tap");
    setCloseState({ positionId, status: "confirm" });
  }, [vibrate, playSound]);

  const handleCloseConfirm = useCallback(async () => {
    if (!closeState || !brokerAccountId) return;
    const { positionId } = closeState;

    setCloseState({ positionId, status: "closing" });
    vibrate("heavy");

    try {
      const res = await fetch("/api/mt5/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerAccountId, positionId }),
      });

      const data = await res.json();

      if (data.ok) {
        setCloseState({ positionId, status: "success" });
        playSound("tap");
        vibrate("light");
        // Brief success flash, then refresh + clear
        setTimeout(() => {
          setCloseState(null);
          router.refresh();
        }, 1200);
      } else {
        setCloseState({
          positionId,
          status: "error",
          errorMsg: data.message ?? "Trade close rejected by broker.",
        });
      }
    } catch (err) {
      setCloseState({
        positionId,
        status: "error",
        errorMsg: err instanceof Error ? err.message : "Network error.",
      });
    }
  }, [closeState, brokerAccountId, router, playSound, vibrate]);

  const handleCloseCancel = useCallback(() => {
    setCloseState(null);
  }, []);

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
                pnl > 0 ? "text-cyan-400" : pnl < 0 ? "text-rose-400" : "text-white/40";
              const sideColor = p.side === "buy" ? "text-cyan-400/80" : "text-rose-400/80";
              const isClosing = closeState?.positionId === p.id;
              const showSuccess = isClosing && closeState?.status === "success";

              return (
                <div
                  key={p.id}
                  className={`relative border-b border-white/[0.04] ${
                    i % 2 === 1 ? "bg-white/[0.015]" : ""
                  } ${showSuccess ? "bg-cyan-500/10" : ""} transition-colors duration-300`}
                >
                  <div className="flex items-center">
                    {/* Position info — tap navigates to chart */}
                    <Link
                      href={`/chart?symbol=${encodeURIComponent(p.symbol)}`}
                      className="flex-1 min-w-0 px-4 py-2.5 active:bg-white/[0.04]"
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

                    {/* Close button */}
                    {brokerAccountId && (
                      <button
                        type="button"
                        onClick={() => handleCloseRequest(p.id)}
                        className="flex h-full items-center justify-center px-3 py-2.5 active:scale-90 transition-transform"
                        aria-label={`Close ${p.symbol} position`}
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15 border border-rose-500/20">
                          <X className="h-3.5 w-3.5 text-rose-400" strokeWidth={2.5} />
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Success flash overlay */}
                  {showSuccess && (
                    <div className="absolute inset-0 flex items-center justify-center bg-cyan-500/10 pointer-events-none">
                      <span className="text-[11px] font-semibold text-cyan-400">✓ Closed</span>
                    </div>
                  )}
                </div>
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
              const typeColor = isBuy ? "text-cyan-400/80" : "text-rose-400/80";
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

      {/* ── Close Confirmation Modal ───────────────────────────────── */}
      {closeState && closeState.status !== "success" && (
        <CloseConfirmModal
          closeState={closeState}
          position={positions.find((p) => p.id === closeState.positionId) ?? null}
          onConfirm={handleCloseConfirm}
          onCancel={handleCloseCancel}
        />
      )}
    </div>
  );
}

/* ── Close Confirmation Modal ──────────────────────────────────────── */
function CloseConfirmModal({
  closeState,
  position,
  onConfirm,
  onCancel,
}: {
  closeState: CloseState;
  position: OpenPositionRow | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!position) return null;

  const pnl = position.profit ?? 0;
  const pnlColor = pnl > 0 ? "text-cyan-400" : pnl < 0 ? "text-rose-400" : "text-white/50";
  const digits = priceDigits(position.openPrice);
  const isClosing = closeState.status === "closing";
  const isError = closeState.status === "error";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isClosing ? undefined : onCancel}
      />

      {/* Modal sheet */}
      <div
        className="relative z-10 w-full max-w-md rounded-t-2xl border-t border-white/[0.08] bg-[#111115] px-5 pb-[max(env(safe-area-inset-bottom,20px),20px)] pt-5"
        style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.6)" }}
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/10" />

        {/* Warning icon + title */}
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 border border-rose-500/20">
            <AlertTriangle className="h-4.5 w-4.5 text-rose-400" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-white">Close Position</h3>
            <p className="text-[11px] text-white/40">This action cannot be undone</p>
          </div>
        </div>

        {/* Position details card */}
        <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] font-bold text-white">{position.symbol}</span>
              <span className={`text-[10px] font-medium capitalize ${position.side === "buy" ? "text-cyan-400/80" : "text-rose-400/80"}`}>
                {position.side}
              </span>
              <span className="text-[10px] text-white/30 tabular-nums">{fmtPrice(position.volume, 2)} lots</span>
            </div>
            <span className={`font-mono text-[13px] font-bold tabular-nums ${pnlColor}`}>
              {fmtPnl(pnl)}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-white/25 tabular-nums">
            {fmtPrice(position.openPrice, digits)} → {fmtPrice(position.currentPrice, digits)}
          </div>
        </div>

        {/* Error message */}
        {isError && closeState.errorMsg && (
          <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
            <p className="text-[11px] text-rose-300">{closeState.errorMsg}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isClosing}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-[13px] font-semibold text-white/60 transition-colors active:bg-white/[0.08] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isClosing}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/30 py-3 text-[13px] font-semibold text-rose-300 transition-colors active:bg-rose-500/30 disabled:opacity-60"
          >
            {isClosing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Closing…
              </>
            ) : isError ? (
              "Retry"
            ) : (
              "Close Trade"
            )}
          </button>
        </div>
      </div>
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
