"use client";

/**
 * PositionsScreen — MT5-style Trade tab.
 *
 * Top section: Balance / Equity / Margin / Free Margin / Margin Level %
 * Two sub-tabs: Positions · Orders
 * Position rows: tap → SL/TP editor sheet, X → close confirm.
 */

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, AlertTriangle, Loader2, LineChart, Pencil } from "lucide-react";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";
import { LiveStatusReporter } from "@/components/shell/LiveStatusReporter";
import { useAmbient } from "@/components/ambient/AmbientProvider";
import type {
  OpenPositionRow,
  PendingOrderRow,
  AccountSummary,
} from "@/lib/broker/loadPositionsPageData";

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

type EditState = {
  positionId: string;
  sl: string;
  tp: string;
  status: "idle" | "saving" | "success" | "error";
  errorMsg?: string;
};

/* ── Helpers ───────────────────────────────────────────────────────── */
function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Step size for +/- buttons based on price magnitude. */
function stepForPrice(p: number | null): number {
  if (!p) return 0.01;
  if (p > 1000) return 1;
  if (p > 100) return 0.1;
  if (p > 10) return 0.01;
  return 0.0001;
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
  const [editState, setEditState] = useState<EditState | null>(null);
  const router = useRouter();
  const { playSound, vibrate } = useAmbient();

  const allLiveOverride: boolean | null =
    providerStatus === "connected"
      ? true
      : providerStatus === "failed"
        ? false
        : null;

  /* ── Close trade handlers ─────────────────────────────────────── */
  const handleCloseRequest = useCallback(
    (positionId: string) => {
      vibrate("medium");
      playSound("tap");
      setCloseState({ positionId, status: "confirm" });
    },
    [vibrate, playSound],
  );

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

  /* ── Edit SL/TP handlers ──────────────────────────────────────── */
  const handleEditRequest = useCallback(
    (p: OpenPositionRow) => {
      vibrate("light");
      playSound("tap");
      const digits = priceDigits(p.openPrice);
      setEditState({
        positionId: p.id,
        sl: p.stopLoss != null ? p.stopLoss.toFixed(digits) : "",
        tp: p.takeProfit != null ? p.takeProfit.toFixed(digits) : "",
        status: "idle",
      });
    },
    [vibrate, playSound],
  );

  const handleEditSave = useCallback(async () => {
    if (!editState || !brokerAccountId) return;
    const { positionId, sl, tp } = editState;

    const slNum = sl.trim() ? parseFloat(sl) : null;
    const tpNum = tp.trim() ? parseFloat(tp) : null;

    // Validate
    if (slNum != null && (!Number.isFinite(slNum) || slNum <= 0)) {
      setEditState((s) =>
        s ? { ...s, status: "error", errorMsg: "Invalid SL value." } : null,
      );
      return;
    }
    if (tpNum != null && (!Number.isFinite(tpNum) || tpNum <= 0)) {
      setEditState((s) =>
        s ? { ...s, status: "error", errorMsg: "Invalid TP value." } : null,
      );
      return;
    }
    if (slNum == null && tpNum == null) {
      setEditState((s) =>
        s
          ? { ...s, status: "error", errorMsg: "Set at least one of SL or TP." }
          : null,
      );
      return;
    }

    setEditState((s) => (s ? { ...s, status: "saving" } : null));
    vibrate("medium");

    try {
      const res = await fetch("/api/mt5/modify-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerAccountId,
          positionId,
          stopLoss: slNum,
          takeProfit: tpNum,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setEditState((s) => (s ? { ...s, status: "success" } : null));
        playSound("tap");
        vibrate("light");
        setTimeout(() => {
          setEditState(null);
          router.refresh();
        }, 1000);
      } else {
        setEditState((s) =>
          s
            ? {
                ...s,
                status: "error",
                errorMsg: data.message ?? "Modify rejected by broker.",
              }
            : null,
        );
      }
    } catch (err) {
      setEditState((s) =>
        s
          ? {
              ...s,
              status: "error",
              errorMsg: err instanceof Error ? err.message : "Network error.",
            }
          : null,
      );
    }
  }, [editState, brokerAccountId, router, playSound, vibrate]);

  const handleEditCancel = useCallback(() => {
    setEditState(null);
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

      {/* ── Account summary bar ────────────────────────────────────── */}
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
          <Link href="/accounts" className="text-white/50 hover:underline">
            Accounts
          </Link>
          {" · "}
          <Link href="/chart" className="text-white/50 hover:underline">
            Chart
          </Link>
        </div>
      )}

      {/* ── Tab switcher ───────────────────────────────────────────── */}
      <div className="flex gap-1 px-3 pb-2">
        <TabButton
          active={activeTab === "positions"}
          onClick={() => setActiveTab("positions")}
          label={`Positions${positions.length > 0 ? ` (${positions.length})` : ""}`}
        />
        <TabButton
          active={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
          label={`Orders${pendingOrders.length > 0 ? ` (${pendingOrders.length})` : ""}`}
        />
      </div>

      {/* ── Positions tab ──────────────────────────────────────────── */}
      {activeTab === "positions" &&
        (positions.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {positions.map((p, i) => (
              <PositionRow
                key={p.id}
                position={p}
                index={i}
                closeState={closeState}
                brokerAccountId={brokerAccountId}
                onClose={handleCloseRequest}
                onEdit={handleEditRequest}
              />
            ))}
          </div>
        ) : (
          <EmptyState text="No open positions" />
        ))}

      {/* ── Orders tab ─────────────────────────────────────────────── */}
      {activeTab === "orders" &&
        (pendingOrders.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pendingOrders.map((o, i) => (
              <OrderRow key={o.id} order={o} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState text="No pending orders" />
        ))}

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {closeState && closeState.status !== "success" && (
        <CloseConfirmModal
          closeState={closeState}
          position={positions.find((p) => p.id === closeState.positionId) ?? null}
          onConfirm={handleCloseConfirm}
          onCancel={handleCloseCancel}
        />
      )}

      {editState && (
        <EditSlTpModal
          editState={editState}
          position={positions.find((p) => p.id === editState.positionId) ?? null}
          onSave={handleEditSave}
          onCancel={handleEditCancel}
          onChange={setEditState}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Position Row ──────────────────────────────────────────────────── */
function PositionRow({
  position: p,
  index: i,
  closeState,
  brokerAccountId,
  onClose,
  onEdit,
}: {
  position: OpenPositionRow;
  index: number;
  closeState: CloseState | null;
  brokerAccountId: string | null;
  onClose: (id: string) => void;
  onEdit: (p: OpenPositionRow) => void;
}) {
  const digits = priceDigits(p.openPrice);
  const pnl = p.profit ?? 0;
  const pnlColor =
    pnl > 0 ? "text-cyan-400" : pnl < 0 ? "text-rose-400" : "text-white/40";
  const sideColor = p.side === "buy" ? "text-cyan-400/80" : "text-rose-400/80";
  const showSuccess =
    closeState?.positionId === p.id && closeState?.status === "success";

  return (
    <div
      className={`relative border-b border-white/[0.04] ${
        i % 2 === 1 ? "bg-white/[0.015]" : ""
      } ${showSuccess ? "bg-cyan-500/10" : ""} transition-colors duration-300`}
    >
      <div className="flex items-center">
        {/* Main area — tap to edit SL/TP */}
        <button
          type="button"
          onClick={() => onEdit(p)}
          className="flex-1 min-w-0 px-4 py-2.5 text-left active:bg-white/[0.04]"
        >
          {/* Row 1 */}
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
            <span
              className={`font-mono text-[12px] font-bold tabular-nums shrink-0 ${pnlColor}`}
            >
              {fmtPnl(pnl)}
            </span>
          </div>
          {/* Row 2 */}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="text-[10px] text-white/25 tabular-nums">
              {fmtPrice(p.openPrice, digits)} → {fmtPrice(p.currentPrice, digits)}
            </span>
            <span className="text-[10px] text-white/20 shrink-0 tabular-nums">
              SL{" "}
              {p.stopLoss != null ? fmtPrice(p.stopLoss, digits) : "—"} · TP{" "}
              {p.takeProfit != null ? fmtPrice(p.takeProfit, digits) : "—"}
            </span>
          </div>
        </button>

        {/* Close button */}
        {brokerAccountId && (
          <button
            type="button"
            onClick={() => onClose(p.id)}
            className="flex h-full items-center justify-center px-3 py-2.5 active:scale-90 transition-transform"
            aria-label={`Close ${p.symbol} position`}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15 border border-rose-500/20">
              <X className="h-3.5 w-3.5 text-rose-400" strokeWidth={2.5} />
            </div>
          </button>
        )}
      </div>

      {showSuccess && (
        <div className="absolute inset-0 flex items-center justify-center bg-cyan-500/10 pointer-events-none">
          <span className="text-[11px] font-semibold text-cyan-400">✓ Closed</span>
        </div>
      )}
    </div>
  );
}

/* ── Order Row (read-only for now) ─────────────────────────────────── */
function OrderRow({ order: o, index: i }: { order: PendingOrderRow; index: number }) {
  const digits = priceDigits(o.openPrice);
  const isBuy = o.type.includes("buy");
  const typeColor = isBuy ? "text-cyan-400/80" : "text-rose-400/80";
  const typeLabel = o.type.replace("_", " ");

  return (
    <Link
      href={`/chart?symbol=${encodeURIComponent(o.symbol)}`}
      className={`block border-b border-white/[0.04] px-4 py-2.5 active:bg-white/[0.04] ${
        i % 2 === 1 ? "bg-white/[0.015]" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-mono text-[12px] font-semibold text-white">{o.symbol}</span>
          <span className={`text-[10px] font-medium capitalize ${typeColor}`}>
            {typeLabel}
          </span>
          <span className="text-[10px] text-white/30 tabular-nums">
            {fmtPrice(o.volume, 2)}
          </span>
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-white/25 tabular-nums">
          @ {fmtPrice(o.openPrice, digits)}
          {o.currentPrice != null ? ` · now ${fmtPrice(o.currentPrice, digits)}` : ""}
        </span>
        <span className="text-[10px] text-white/20 shrink-0 tabular-nums">
          SL {o.stopLoss != null ? fmtPrice(o.stopLoss, digits) : "—"} · TP{" "}
          {o.takeProfit != null ? fmtPrice(o.takeProfit, digits) : "—"}
        </span>
      </div>
    </Link>
  );
}

/** Bottom edge of trade sheets — explicit calc so iOS PWA always clears the nav pill. */
const TRADE_SHEET_BOTTOM =
  "calc(4.1rem + env(safe-area-inset-bottom, 0px) + 0.85rem)";

function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function TradeSheetShell({
  onBackdropClick,
  children,
}: {
  onBackdropClick?: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    document.body.classList.add("trade-sheet-open");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("trade-sheet-open");
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[110]">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onBackdropClick}
          aria-hidden
        />
        <div
          className="absolute left-1/2 w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl border-t border-white/[0.08] bg-[#111115] px-5 pt-5 pb-4"
          style={{
            bottom: TRADE_SHEET_BOTTOM,
            maxHeight: `calc(100dvh - ${TRADE_SHEET_BOTTOM} - env(safe-area-inset-top, 0px) - 0.5rem)`,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
            WebkitOverflowScrolling: "touch",
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-white/10" />
          {children}
        </div>
      </div>
    </BodyPortal>
  );
}

/* ── Edit SL/TP Modal ──────────────────────────────────────────────── */
function EditSlTpModal({
  editState,
  position,
  onSave,
  onCancel,
  onChange,
}: {
  editState: EditState;
  position: OpenPositionRow | null;
  onSave: () => void;
  onCancel: () => void;
  onChange: (s: EditState) => void;
}) {
  if (!position) return null;

  const pnl = position.profit ?? 0;
  const pnlColor =
    pnl > 0 ? "text-cyan-400" : pnl < 0 ? "text-rose-400" : "text-white/50";
  const digits = priceDigits(position.openPrice);
  const step = stepForPrice(position.openPrice);
  const isSaving = editState.status === "saving";
  const isSuccess = editState.status === "success";
  const isError = editState.status === "error";

  const slChanged =
    editState.sl !== (position.stopLoss != null ? position.stopLoss.toFixed(digits) : "");
  const tpChanged =
    editState.tp !== (position.takeProfit != null ? position.takeProfit.toFixed(digits) : "");
  const hasChanges = slChanged || tpChanged;

  const nudgeSl = (dir: 1 | -1) => {
    const cur = editState.sl ? parseFloat(editState.sl) : position.currentPrice ?? 0;
    const next = Math.max(0, cur + dir * step);
    onChange({ ...editState, sl: next.toFixed(digits), status: "idle", errorMsg: undefined });
  };

  const nudgeTp = (dir: 1 | -1) => {
    const cur = editState.tp ? parseFloat(editState.tp) : position.currentPrice ?? 0;
    const next = Math.max(0, cur + dir * step);
    onChange({ ...editState, tp: next.toFixed(digits), status: "idle", errorMsg: undefined });
  };

  return (
    <TradeSheetShell onBackdropClick={isSaving ? undefined : onCancel}>
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/20">
                <Pencil className="h-4 w-4 text-cyan-400" strokeWidth={2} />
              </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white">Edit SL / TP</h3>
              <p className="text-[11px] text-white/40">
                {position.symbol} · {position.side} · {fmtPrice(position.volume, 2)} lots
              </p>
            </div>
          </div>
          {/* Chart link */}
          <Link
            href={`/chart?symbol=${encodeURIComponent(position.symbol)}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] active:bg-white/[0.12]"
            aria-label="View on chart"
          >
            <LineChart className="h-4 w-4 text-white/50" strokeWidth={1.5} />
          </Link>
        </div>

        {/* Position summary card */}
        <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-white/30 tabular-nums">
              {fmtPrice(position.openPrice, digits)} → {fmtPrice(position.currentPrice, digits)}
            </span>
            <span className={`font-mono text-[12px] font-bold tabular-nums ${pnlColor}`}>
              {fmtPnl(pnl)}
            </span>
          </div>
        </div>

        {/* SL input */}
        <div className="mb-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400/70">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Stop Loss
          </label>
          <PriceInput
            value={editState.sl}
            placeholder={`e.g. ${fmtPrice(position.currentPrice, digits)}`}
            onValueChange={(v) =>
              onChange({ ...editState, sl: v, status: "idle", errorMsg: undefined })
            }
            onNudge={nudgeSl}
            disabled={isSaving}
            accentClass="focus:border-rose-500/40 focus:ring-rose-500/20"
          />
        </div>

        {/* TP input */}
        <div className="mb-4">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-400/70">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            Take Profit
          </label>
          <PriceInput
            value={editState.tp}
            placeholder={`e.g. ${fmtPrice(position.currentPrice, digits)}`}
            onValueChange={(v) =>
              onChange({ ...editState, tp: v, status: "idle", errorMsg: undefined })
            }
            onNudge={nudgeTp}
            disabled={isSaving}
            accentClass="focus:border-cyan-500/40 focus:ring-cyan-500/20"
          />
        </div>

        {/* Error message */}
        {isError && editState.errorMsg && (
          <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
            <p className="text-[11px] text-rose-300">{editState.errorMsg}</p>
          </div>
        )}

        {/* Success */}
        {isSuccess && (
          <div className="mb-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
            <p className="text-[11px] text-cyan-300">✓ SL/TP updated successfully</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 text-[13px] font-semibold text-white/60 transition-colors active:bg-white/[0.08] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !hasChanges || isSuccess}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 py-3 text-[13px] font-semibold text-cyan-300 transition-colors active:bg-cyan-500/30 disabled:opacity-40"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isError ? (
              "Retry"
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
    </TradeSheetShell>
  );
}

/* ── Price Input with +/- buttons ──────────────────────────────────── */
function PriceInput({
  value,
  placeholder,
  onValueChange,
  onNudge,
  disabled,
  accentClass,
}: {
  value: string;
  placeholder: string;
  onValueChange: (v: string) => void;
  onNudge: (dir: 1 | -1) => void;
  disabled: boolean;
  accentClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onNudge(-1)}
        disabled={disabled}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[16px] font-bold text-white/50 active:bg-white/[0.12] disabled:opacity-30"
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        className={`h-10 flex-1 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-center font-mono text-[14px] tabular-nums text-white placeholder:text-white/20 outline-none ring-0 transition-all disabled:opacity-40 ${accentClass}`}
      />
      <button
        type="button"
        onClick={() => onNudge(1)}
        disabled={disabled}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[16px] font-bold text-white/50 active:bg-white/[0.12] disabled:opacity-30"
      >
        +
      </button>
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
  const pnlColor =
    pnl > 0 ? "text-cyan-400" : pnl < 0 ? "text-rose-400" : "text-white/50";
  const digits = priceDigits(position.openPrice);
  const isClosing = closeState.status === "closing";
  const isError = closeState.status === "error";

  return (
    <TradeSheetShell onBackdropClick={isClosing ? undefined : onCancel}>
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 border border-rose-500/20">
            <AlertTriangle className="h-4 w-4 text-rose-400" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-white">Close Position</h3>
            <p className="text-[11px] text-white/40">This action cannot be undone</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[13px] font-bold text-white">
                {position.symbol}
              </span>
              <span
                className={`text-[10px] font-medium capitalize ${
                  position.side === "buy" ? "text-cyan-400/80" : "text-rose-400/80"
                }`}
              >
                {position.side}
              </span>
              <span className="text-[10px] text-white/30 tabular-nums">
                {fmtPrice(position.volume, 2)} lots
              </span>
            </div>
            <span className={`font-mono text-[13px] font-bold tabular-nums ${pnlColor}`}>
              {fmtPnl(pnl)}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-white/25 tabular-nums">
            {fmtPrice(position.openPrice, digits)} → {fmtPrice(position.currentPrice, digits)}
          </div>
        </div>

        {isError && closeState.errorMsg && (
          <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
            <p className="text-[11px] text-rose-300">{closeState.errorMsg}</p>
          </div>
        )}

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
    </TradeSheetShell>
  );
}

/* ── Tiny helpers ──────────────────────────────────────────────────── */
function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-center text-[11px] font-semibold uppercase tracking-wide transition-colors ${
        active ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-xs text-white/25">{text}</p>
    </div>
  );
}

function AccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-[9px] uppercase tracking-wider text-white/25">{label}</span>
      <p className="font-mono text-[11px] font-semibold tabular-nums text-white/70">{value}</p>
    </div>
  );
}
