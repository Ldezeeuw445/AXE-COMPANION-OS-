"use client";

import { useState } from "react";
import { ArrowRight, MoveVertical } from "lucide-react";
import { useInstantSlTpModify } from "@/lib/chart/instantSlTpModify";
import { RiskConfirmationModal } from "@/components/risk/RiskConfirmationModal";

export function SlTpModifyPanel({
  initialInstant,
  liveTradingEnabled = false,
}: {
  initialInstant: boolean;
  liveTradingEnabled?: boolean;
}) {
  const { enabled, pending, setInstant } = useInstantSlTpModify(initialInstant);
  const blocked = !liveTradingEnabled;
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
        <header>
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
            Chart SL / TP modify
          </h2>
          <p className="mt-1 text-xs text-tos-muted">
            After you place an order, drag stop loss and take profit on the chart. By default AXE
            works like MetaTrader: release the line, then tap the arrow on the entry label to send
            the new levels to your broker.
          </p>
        </header>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 accent-cyan-400"
              checked={enabled}
              disabled={pending || blocked}
              onChange={(e) => {
                if (blocked && e.target.checked) return;
                if (e.target.checked && !enabled) {
                  setConfirmOpen(true);
                  return;
                }
                void setInstant(false);
              }}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white/90">
                <MoveVertical className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
                Apply on drag release
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-tos-muted">
                When enabled, letting go of SL or TP immediately updates the broker — no confirm
                arrow. When off, you must press the{" "}
                <ArrowRight className="inline h-3 w-3 text-cyan-300/90" aria-hidden /> button on the
                order line (MT5 style).
              </span>
            </span>
          </label>

          <p className="text-[10px] text-tos-dim">
            {blocked
              ? "Enable Live trading first (3-step risk confirmation) to unlock instant drag release."
              : `Synced to your account · ${enabled ? "Instant apply" : "Confirm with arrow (default)"}`}
          </p>
        </div>
      </section>
      <RiskConfirmationModal
        open={confirmOpen}
        pending={pending}
        title="Enable instant SL/TP modify"
        subtitle="This removes MT5-style confirm arrow and sends changes on drag release."
        confirmLabel="Enable instant mode"
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await setInstant(true);
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
