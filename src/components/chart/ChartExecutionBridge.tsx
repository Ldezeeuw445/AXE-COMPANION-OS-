"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Lock, ShieldAlert, X } from "lucide-react";

type Props = {
  symbol: string;
  brokerSymbol: string;
  timeframeLabel: string;
  lastPrice: number | null;
  digits: number;
  defaultSide?: "buy" | "sell";
  defaultOrderType?: "market" | "limit" | "stop";
  defaultVolume?: string;
  entryPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  onClose: () => void;
};

const EXECUTION_FEATURE_FLAG =
  process.env.NEXT_PUBLIC_ENABLE_EXECUTION_BRIDGE === "true";

/**
 * Compact execution bridge under the chart.
 *
 * Default state: review-only. AXE prepares an order *ticket* — nothing is sent
 * to a broker without explicit user approval. When `NEXT_PUBLIC_ENABLE_EXECUTION_BRIDGE`
 * is unset/false, the bridge stays in review-only mode and the "Send to broker"
 * action is permanently disabled.
 *
 * Even when the feature flag is enabled, a two-step confirmation modal is
 * required and the actual broker connection is only wired up explicitly later.
 */
export function ChartExecutionBridge({
  symbol,
  brokerSymbol,
  timeframeLabel,
  lastPrice,
  digits,
  defaultSide = "buy",
  defaultOrderType = "market",
  defaultVolume = "0.10",
  entryPrice,
  stopLossPrice,
  takeProfitPrice,
  onClose,
}: Props) {
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">(defaultOrderType);
  const [volume, setVolume] = useState<string>(defaultVolume);
  const [entry, setEntry] = useState<string>((entryPrice ?? lastPrice) ? (entryPrice ?? lastPrice)?.toFixed(digits) ?? "" : "");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [risk, setRisk] = useState<string>("0.5");
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  const [approvalOpen, setApprovalOpen] = useState<boolean>(false);

  useEffect(() => {
    setSide(defaultSide);
  }, [defaultSide]);

  useEffect(() => {
    setOrderType(defaultOrderType);
  }, [defaultOrderType]);

  useEffect(() => {
    setVolume(defaultVolume);
  }, [defaultVolume]);

  useEffect(() => {
    const next = entryPrice ?? lastPrice;
    if (next != null && Number.isFinite(next)) setEntry(next.toFixed(digits));
  }, [digits, entryPrice, lastPrice]);

  useEffect(() => {
    if (stopLossPrice != null && Number.isFinite(stopLossPrice)) setStopLoss(stopLossPrice.toFixed(digits));
  }, [digits, stopLossPrice]);

  useEffect(() => {
    if (takeProfitPrice != null && Number.isFinite(takeProfitPrice)) setTakeProfit(takeProfitPrice.toFixed(digits));
  }, [digits, takeProfitPrice]);

  const planText = buildPlanText({
    symbol,
    brokerSymbol,
    timeframeLabel,
    side,
    orderType,
    volume,
    entry,
    stopLoss,
    takeProfit,
    risk,
  });

  return (
    <section className="-mx-4 relative shrink-0 overflow-hidden border-b border-white/[0.08] bg-[#05070A] md:mx-0 md:border-x">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.05] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-cyan-300/85" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tos-muted">
            Execution bridge
          </p>
          <span className="rounded-full border border-amber-400/25 bg-amber-400/8 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber-200/95">
            Review-only
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide execution bridge"
          className="rounded-full border border-white/10 bg-white/[0.04] p-1 text-tos-muted hover:bg-white/[0.08]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        <p className="rounded border border-amber-400/15 bg-amber-400/[0.04] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-amber-200/90">
          AXE can prepare an order ticket. Broker execution is{" "}
          <span className="font-semibold">disabled by default</span>. Nothing is sent until you
          explicitly approve, and only when this app build has the execution bridge feature flag
          enabled.
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`rounded border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
              side === "buy"
                ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-200/95"
                : "border-white/10 bg-white/[0.03] text-tos-muted hover:bg-white/[0.06]"
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`rounded border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
              side === "sell"
                ? "border-rose-400/40 bg-rose-400/12 text-rose-200/95"
                : "border-white/10 bg-white/[0.03] text-tos-muted hover:bg-white/[0.06]"
            }`}
          >
            Sell
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {(["market", "limit", "stop"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`rounded border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                orderType === t
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100/95"
                  : "border-white/10 bg-white/[0.03] text-tos-muted hover:bg-white/[0.06]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Volume (lots)" value={volume} onChange={setVolume} placeholder="0.10" />
          <Field label="Risk %" value={risk} onChange={setRisk} placeholder="0.5" />
          <Field
            label={orderType === "market" ? "Entry (last)" : "Entry"}
            value={entry}
            onChange={setEntry}
            placeholder={lastPrice ? lastPrice.toFixed(digits) : "—"}
          />
          <Field label="Stop loss" value={stopLoss} onChange={setStopLoss} placeholder="—" />
          <Field
            label="Take profit"
            value={takeProfit}
            onChange={setTakeProfit}
            placeholder="—"
            wide
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.06] bg-black/35 p-2 text-[11px] leading-relaxed text-tos-muted">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 rounded border-white/20"
          />
          <span>
            I understand AXE can prepare orders, but I must review and approve before anything is
            sent. AXE never auto-executes.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/chat?q=${encodeURIComponent(planText)}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-[11px] font-semibold text-cyan-100/95 hover:bg-cyan-500/18"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Prepare order ticket (review)
          </Link>
          <button
            type="button"
            onClick={() => setApprovalOpen(true)}
            disabled={!acknowledged || !EXECUTION_FEATURE_FLAG}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/8 px-3 py-2.5 text-[11px] font-semibold text-rose-200/95 transition-colors hover:bg-rose-400/12 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Lock className="h-3.5 w-3.5" />
            Send to broker
          </button>
        </div>

        {!EXECUTION_FEATURE_FLAG ? (
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[10px] leading-relaxed text-tos-dim">
            Broker execution is not enabled in this build. AXE can still prepare a complete review
            ticket and a structured trade plan via chat.
          </p>
        ) : null}
      </div>

      {approvalOpen ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#04070C]/90 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-400/25 bg-[#0A0E14] p-4">
            <p className="text-sm font-semibold text-tos-text">Final approval</p>
            <p className="mt-2 text-[12px] leading-relaxed text-tos-muted">
              {EXECUTION_FEATURE_FLAG
                ? "Broker execution is currently behind a manual review-only stub. No live order will be placed."
                : "Execution is disabled in this build. The bridge stays review-only."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setApprovalOpen(false)}
                className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-tos-muted hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setApprovalOpen(false)}
                disabled
                className="rounded-lg border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-[11px] font-semibold text-rose-200/85 opacity-55"
              >
                Send (disabled)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-tos-dim">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[12px] text-tos-text outline-none focus:border-cyan-500/40"
      />
    </label>
  );
}

function buildPlanText(input: {
  symbol: string;
  brokerSymbol: string;
  timeframeLabel: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop";
  volume: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  risk: string;
}): string {
  const lines = [
    `[AXE · order ticket review]`,
    `Symbol: ${input.symbol} (broker ${input.brokerSymbol})`,
    `Timeframe: ${input.timeframeLabel}`,
    `Side: ${input.side.toUpperCase()}`,
    `Type: ${input.orderType}`,
    `Volume: ${input.volume || "—"} lots`,
    `Risk: ${input.risk || "—"} %`,
    `Entry: ${input.entry || "—"}`,
    `Stop loss: ${input.stopLoss || "—"}`,
    `Take profit: ${input.takeProfit || "—"}`,
    "",
    "Review this ticket: validate structure, risk, RR, timing, and what evidence I want before pulling the trigger. Execution stays disabled until I explicitly approve later.",
  ];
  return lines.join("\n");
}
