"use client";

import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { formatBrokerPrice } from "@/lib/broker/symbolFormat";

type Props = {
  symbol: string;
  orderLabel: string;
  side: "buy" | "sell";
  volume: string;
  price: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onSubmit: () => void;
  onOpenLot: () => void;
  onOpenType: () => void;
  onToggleSl: () => void;
  onToggleTp: () => void;
  onPriceChange: (price: number) => void;
  onSlChange: (price: number) => void;
  onTpChange: (price: number) => void;
};

export function ChartPendingOrderSheet({
  symbol,
  orderLabel,
  side,
  volume,
  price,
  stopLoss,
  takeProfit,
  expanded,
  onToggleExpand,
  onSubmit,
  onOpenLot,
  onOpenType,
  onToggleSl,
  onToggleTp,
  onPriceChange,
  onSlChange,
  onTpChange,
}: Props) {
  const accent = side === "buy" ? "#22D3EE" : "#E13947";
  const priceText = price != null ? formatBrokerPrice(symbol, price) : "—";

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] border-t border-white/[0.08] shadow-[0_-18px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      style={{
        background: "linear-gradient(180deg, rgba(14,16,20,0.97) 0%, rgba(6,6,8,0.99) 100%)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.35rem)",
        maxHeight: expanded ? "min(52vh, 420px)" : undefined,
      }}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center justify-center py-1.5"
        aria-label={expanded ? "Collapse order panel" : "Expand order panel"}
      >
        <span className="h-1 w-10 rounded-full bg-white/20" />
      </button>

      <div className="flex h-[2.75rem] items-center gap-0 px-0">
        <button
          type="button"
          onClick={onSubmit}
          className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-white active:scale-95"
          style={{
            background:
              side === "buy"
                ? "linear-gradient(180deg, #14a0b5 0%, #0a5e6c 100%)"
                : "linear-gradient(180deg, #d42a36 0%, #8a1522 100%)",
          }}
          aria-label={`Place ${orderLabel}`}
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 text-[13px] font-bold"
        >
          <span style={{ color: accent }}>{orderLabel}</span>
          <span className="font-mono text-white/90">{volume}</span>
          <span className="font-mono text-[11px] text-white/45">{priceText}</span>
        </button>
        <button type="button" onClick={onToggleSl} className="flex h-full w-12 items-center justify-center" aria-label="Toggle stop loss">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[9px] font-black ${
              stopLoss != null ? "border-[#E13947] bg-[#E13947]/15 text-[#E13947]" : "border-white/15 text-white/25"
            }`}
          >
            SL
          </span>
        </button>
        <button type="button" onClick={onToggleTp} className="flex h-full w-12 items-center justify-center" aria-label="Toggle take profit">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[9px] font-black ${
              takeProfit != null ? "border-[#4ECBA0] bg-[#4ECBA0]/15 text-[#4ECBA0]" : "border-white/15 text-white/25"
            }`}
          >
            TP
          </span>
        </button>
        <button type="button" onClick={onOpenType} className="flex h-full w-11 items-center justify-center" aria-label="Change order type">
          {expanded ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronUp className="h-4 w-4 text-white/40" />}
        </button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-white/[0.06] px-4 py-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Entry price</label>
            <input
              type="text"
              inputMode="decimal"
              value={priceText === "—" ? "" : priceText}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(",", "."));
                if (Number.isFinite(v) && v > 0) onPriceChange(v);
              }}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[15px] text-white outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#E13947]/80">Stop loss</label>
              <input
                type="text"
                inputMode="decimal"
                disabled={stopLoss == null}
                value={stopLoss != null ? formatBrokerPrice(symbol, stopLoss) : ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(",", "."));
                  if (Number.isFinite(v) && v > 0) onSlChange(v);
                }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[14px] text-white outline-none disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#4ECBA0]/80">Take profit</label>
              <input
                type="text"
                inputMode="decimal"
                disabled={takeProfit == null}
                value={takeProfit != null ? formatBrokerPrice(symbol, takeProfit) : ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(",", "."));
                  if (Number.isFinite(v) && v > 0) onTpChange(v);
                }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[14px] text-white outline-none disabled:opacity-40"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenLot}
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/85"
            >
              Volume · {volume}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="flex-[1.4] rounded-lg px-3 py-2 text-[12px] font-bold text-white"
              style={{
                background:
                  side === "buy"
                    ? "linear-gradient(180deg, #14a0b5 0%, #0a5e6c 100%)"
                    : "linear-gradient(180deg, #d42a36 0%, #8a1522 100%)",
              }}
            >
              Place {orderLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
