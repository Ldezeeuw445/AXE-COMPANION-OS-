"use client";

/**
 * Final-confirm modal that sits between the chart's "Send" pill and the
 * actual MetaApi POST. Even when live trading is enabled + armed, every
 * single live order goes through this dialog. Two distinct buttons to
 * commit, with risk text and a clear summary of what will be sent.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import { formatBrokerPrice } from "@/lib/broker/symbolFormat";

export type OrderConfirmInput = {
  symbol: string;
  brokerSymbol: string;
  side: "buy" | "sell";
  orderType: "market" | "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
  volume: number;
  /** Display digits — used only for formatting. */
  digits: number;
  openPrice: number | null;
  livePrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  slippagePoints: number;
  /** Human-readable account label so the user can sanity-check it isn't demo. */
  accountLabel: string;
};

export type OrderConfirmStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function ChartOrderConfirm({
  open,
  input,
  status,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  input: OrderConfirmInput | null;
  status: OrderConfirmStatus;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [primaryArmed, setPrimaryArmed] = useState(false);

  useEffect(() => {
    if (!open) setPrimaryArmed(false);
  }, [open]);

  if (!open || !input) return null;

  const isBuy = input.side === "buy";
  const sideClasses = isBuy
    ? "border-cyan-400/40 bg-cyan-400/12 text-cyan-100"
    : "border-rose-400/40 bg-rose-400/12 text-rose-100";

  const orderTypeLabel = labelOrderType(input.orderType);
  const priceLabel = input.orderType === "market"
    ? input.livePrice != null
      ? formatBrokerPrice(input.brokerSymbol, input.livePrice)
      : "—"
    : input.openPrice != null
      ? formatBrokerPrice(input.brokerSymbol, input.openPrice)
      : "—";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/72 p-4 backdrop-blur sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm live order"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#08080C] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className={`grid h-9 w-9 place-items-center rounded-full border ${sideClasses}`}>
              {isBuy ? (
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowDownRight className="h-4 w-4" aria-hidden />
              )}
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-tos-text">
                Send{" "}
                <span className={isBuy ? "text-cyan-300" : "text-rose-300"}>
                  {input.side.toUpperCase()}
                </span>{" "}
                · {input.symbol}
              </p>
              <p className="mt-0.5 text-[11px] text-tos-muted">
                {orderTypeLabel} · {input.volume.toFixed(2)} lots · {input.accountLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/[0.04] p-1 text-tos-muted hover:bg-white/[0.08]"
            aria-label="Close"
            disabled={status.kind === "sending"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/22 bg-amber-400/[0.05] px-3 py-2 text-[11.5px] leading-relaxed text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
          <p>
            This sends a real order to your broker. Review the values below — symbol, side,
            volume, price and stops are exactly what AXE will submit.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-[12px]">
          <Row label="Account" value={input.accountLabel} mono={false} />
          <Row label="Broker symbol" value={input.brokerSymbol} />
          <Row label="Type" value={orderTypeLabel} mono={false} />
          <Row label="Volume" value={`${input.volume.toFixed(2)} lots`} />
          <Row label="Price" value={priceLabel} highlight={isBuy ? "cyan" : "rose"} />
          <Row
            label="Stop loss"
            value={input.stopLoss != null ? formatBrokerPrice(input.brokerSymbol, input.stopLoss) : "—"}
            highlight={input.stopLoss != null ? "rose" : null}
          />
          <Row
            label="Take profit"
            value={input.takeProfit != null ? formatBrokerPrice(input.brokerSymbol, input.takeProfit) : "—"}
            highlight={input.takeProfit != null ? "cyan" : null}
          />
          <Row label="Slippage" value={`${input.slippagePoints} pts`} />
        </dl>

        {status.kind === "error" ? (
          <div className="mt-3 rounded-xl border border-rose-400/35 bg-rose-400/10 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200/95">
            {status.message}
          </div>
        ) : null}
        {status.kind === "ok" ? (
          <div className="mt-3 rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-[11.5px] leading-relaxed text-cyan-100/95">
            {status.message}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={status.kind === "sending"}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold text-tos-muted hover:bg-white/[0.08] disabled:opacity-45"
          >
            Cancel
          </button>
          {!primaryArmed ? (
            <button
              type="button"
              onClick={() => setPrimaryArmed(true)}
              disabled={status.kind === "sending"}
              className={`rounded-xl border px-4 py-2.5 text-[12px] font-semibold ${
                isBuy
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/16"
                  : "border-rose-400/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/16"
              } disabled:opacity-45`}
            >
              Arm to send
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={status.kind === "sending" || status.kind === "ok"}
              className={`rounded-xl border px-4 py-2.5 text-[12px] font-semibold ${
                isBuy
                  ? "border-cyan-400/65 bg-cyan-400/22 text-cyan-50 shadow-[0_0_0_3px_rgba(34,211,238,0.16)] hover:bg-cyan-400/28"
                  : "border-rose-400/65 bg-rose-400/22 text-rose-50 shadow-[0_0_0_3px_rgba(244,63,94,0.16)] hover:bg-rose-400/28"
              } disabled:opacity-55`}
            >
              {status.kind === "sending"
                ? "Sending…"
                : status.kind === "ok"
                  ? "Sent"
                  : `Send ${input.side.toUpperCase()}`}
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-[10.5px] leading-relaxed text-tos-dim">
          Two-tap confirm — &quot;Arm&quot; first, then &quot;Send&quot;. Cancel any time.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = true,
  highlight = null,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: "cyan" | "rose" | null;
}) {
  const valueClass = highlight === "cyan"
    ? "text-cyan-200"
    : highlight === "rose"
      ? "text-rose-200"
      : "text-tos-text";
  return (
    <>
      <dt className="text-[10px] uppercase tracking-wider text-tos-dim">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono" : ""} text-[12px] font-semibold ${valueClass}`}>
        {value}
      </dd>
    </>
  );
}

function labelOrderType(t: OrderConfirmInput["orderType"]): string {
  switch (t) {
    case "market":
      return "Market execution";
    case "buy_limit":
      return "Buy Limit (pending)";
    case "sell_limit":
      return "Sell Limit (pending)";
    case "buy_stop":
      return "Buy Stop (pending)";
    case "sell_stop":
      return "Sell Stop (pending)";
  }
}
