"use client";

/**
 * Settings · Live trading
 *
 * The single point in the app where a user opts into sending real broker
 * orders. Off by default; turning it on requires the three MetaAPI compliance
 * checkboxes. Even after this, every BUY/SELL on the chart still asks for a
 * final confirm before going to MetaApi.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldOff, X } from "lucide-react";
import { TosMatteBanner } from "@/components/ui/TosNotice";
import { MetaApiComplianceCheckboxes } from "@/components/legal/MetaApiComplianceCheckboxes";
import { META_API_COMPLIANCE_FIELDS } from "@/lib/legal/constants";
import { useLiveTradingFlag } from "@/lib/liveTrading/liveTradingFlag";

function liveTradingCheckboxesOk(): boolean {
  if (typeof document === "undefined") return false;
  const { terms, softwareTool, orderForward } = META_API_COMPLIANCE_FIELDS;
  const el = (name: string) =>
    document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
  return el(terms) && el(softwareTool) && el(orderForward);
}

export function LiveTradingPanel({ initialEnabled }: { initialEnabled: boolean }) {
  const live = useLiveTradingFlag(initialEnabled);
  const [open, setOpen] = useState(false);
  const [checkboxesOk, setCheckboxesOk] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    if (!open) setCheckboxesOk(false);
  }, [open]);

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
            Live trading
          </h2>
          <p className="mt-1 text-xs text-tos-muted">
            Off by default. Activation is account-wide (synced across your devices) and stays on
            until you turn it off. Every BUY / SELL still asks for a final 2-tap confirm on the
            chart. Demo paper trading always works without this.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em] ${
            live.enabled
              ? "border-white/[0.10] bg-white/[0.05] text-white/90"
              : "border-white/12 bg-white/[0.04] text-tos-dim"
          }`}
        >
          {live.enabled ? "ON" : "OFF"}
        </span>
      </header>

      {!live.enabled ? (
        <div className="mt-4 space-y-3">
          <TosMatteBanner accent="amber">
            Activating live trading lets BUY / SELL on a connected MT5 account send real orders to
            your broker. AXE never auto-executes, but a wrong tap can lose real money. Make sure
            you understand the risks before enabling.
          </TosMatteBanner>
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={live.pending}
            className="inline-flex items-center gap-2 rounded-full border border-rose-400/35 bg-rose-400/10 px-4 py-2 text-[11.5px] font-semibold text-rose-200/95 hover:bg-rose-400/16 disabled:opacity-55"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {live.pending ? "Saving…" : "Activate live trading"}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <TosMatteBanner accent="emerald">
            Live trading is enabled on your account. BUY / SELL on a connected MT5 account opens a
            final 2-tap confirm before any order leaves the app.
          </TosMatteBanner>

          <button
            type="button"
            onClick={() => setConfirmDisable(true)}
            disabled={live.pending}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11.5px] font-semibold text-tos-muted hover:bg-white/[0.08] hover:text-tos-text disabled:opacity-55"
          >
            <ShieldOff className="h-3.5 w-3.5" aria-hidden />
            {live.pending ? "Saving…" : "Disable live trading"}
          </button>
        </div>
      )}

      {open ? (
        <ActivateModal
          onCheckboxChange={() => setCheckboxesOk(liveTradingCheckboxesOk())}
          canEnable={checkboxesOk}
          pending={live.pending}
          onClose={() => setOpen(false)}
          onEnable={async () => {
            await live.enable();
            setOpen(false);
          }}
        />
      ) : null}

      {confirmDisable ? (
        <DisableModal
          pending={live.pending}
          onClose={() => setConfirmDisable(false)}
          onConfirm={async () => {
            await live.disable();
            setConfirmDisable(false);
          }}
        />
      ) : null}
    </section>
  );
}

function ActivateModal({
  onCheckboxChange,
  canEnable,
  pending,
  onClose,
  onEnable,
}: {
  onCheckboxChange: () => void;
  canEnable: boolean;
  pending: boolean;
  onClose: () => void;
  onEnable: () => void | Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/72 p-4 backdrop-blur sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Activate live trading"
    >
      <div className="w-full max-w-md rounded-2xl border border-rose-400/30 bg-[#060a14] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-rose-400/35 bg-rose-400/10">
              <AlertTriangle className="h-4 w-4 text-rose-300" aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-tos-text">
                Activate live trading
              </p>
              <p className="mt-0.5 text-[11px] text-tos-muted">
                Confirm all three acknowledgements before enabling real broker orders.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.04] p-1 text-tos-muted hover:bg-white/[0.08]"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div onChange={onCheckboxChange}>
          <MetaApiComplianceCheckboxes variant="master" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold text-tos-muted hover:bg-white/[0.08]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onEnable}
            disabled={!canEnable || pending}
            className="rounded-xl border border-rose-400/40 bg-rose-400/12 px-4 py-2.5 text-[12px] font-semibold text-rose-100/95 hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? "Saving…" : "Enable live trading"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DisableModal({
  onClose,
  onConfirm,
  pending,
}: {
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  pending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/72 p-4 backdrop-blur sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Disable live trading"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#060a14] p-5">
        <p className="text-[14px] font-semibold tracking-tight text-tos-text">
          Disable live trading?
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-tos-muted">
          BUY / SELL on connected MT5 accounts will stop sending orders on every device using this
          account. Demo Account paper trading continues to work. You can re-activate any time.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-tos-muted hover:bg-white/[0.08]"
          >
            Keep on
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-xl border border-rose-400/35 bg-rose-400/10 px-4 py-2 text-[12px] font-semibold text-rose-200/95 hover:bg-rose-400/15 disabled:opacity-55"
          >
            {pending ? "Saving…" : "Disable"}
          </button>
        </div>
      </div>
    </div>
  );
}
