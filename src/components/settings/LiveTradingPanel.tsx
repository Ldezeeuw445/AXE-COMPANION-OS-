"use client";

/**
 * Settings · Live trading
 *
 * The single point in the app where a user opts into sending real broker
 * orders. Off by default; turning it on requires a 3-checkbox + typed-phrase
 * disclaimer. Even after this, every BUY/SELL on the chart still asks for a
 * final confirm before going to MetaApi.
 *
 * The flag is per-device on purpose. See `liveTradingFlag.ts`.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, ShieldOff, X } from "lucide-react";
import {
  ARM_WINDOW_MS,
  REQUIRED_PHRASE,
  useLiveTradingFlag,
} from "@/lib/liveTrading/liveTradingFlag";

export function LiveTradingPanel({ initialEnabled }: { initialEnabled: boolean }) {
  const live = useLiveTradingFlag(initialEnabled);
  const [open, setOpen] = useState(false);
  const [riskAck, setRiskAck] = useState(false);
  const [responsibilityAck, setResponsibilityAck] = useState(false);
  const [autoExecAck, setAutoExecAck] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    if (!open) {
      setRiskAck(false);
      setResponsibilityAck(false);
      setAutoExecAck(false);
      setPhrase("");
    }
  }, [open]);

  const phraseMatches = phrase.trim() === REQUIRED_PHRASE;
  const canEnable = riskAck && responsibilityAck && autoExecAck && phraseMatches;

  const armWindowMin = Math.round(ARM_WINDOW_MS / 60_000);

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-black/30 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
            Live trading
          </h2>
          <p className="mt-1 text-xs text-tos-muted">
            Off by default. Activation is account-wide (synced across your devices) and stays on
            until you turn it off. Each device still starts disarmed and every BUY / SELL asks for
            a final tap. Demo paper trading always works without this.
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
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/22 bg-amber-400/[0.05] px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-200/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
            <p>
              Activating live trading lets BUY / SELL on a connected MT5 account send real orders to
              your broker. AXE never auto-executes, but a wrong tap can lose real money. Make sure
              you understand the risks before enabling.
            </p>
          </div>
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
          <div className="flex items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-[11.5px] leading-relaxed text-white/90">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
            <p>
              Live trading is enabled on your account. BUY / SELL on a connected MT5 account opens a
              final 2‑tap confirm before any order leaves the app. The arming window below is
              per‑device — each new device starts disarmed even when this stays on.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-tos-muted">
            <div>
              <p className="font-mono text-tos-text">
                Arming window:{" "}
                <span className="font-semibold">{armWindowMin} min</span>{" "}
                <span className="text-tos-dim">
                  ({live.armed ? formatRemaining(live.armedUntilMs) : "not armed"})
                </span>
              </p>
              <p className="text-[10.5px] text-tos-dim">
                Each BUY/SELL still asks for a final confirm tap.
              </p>
            </div>
            {live.armed ? (
              <button
                type="button"
                onClick={live.disarm}
                className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[10.5px] font-semibold text-tos-muted hover:bg-white/[0.08] hover:text-tos-text"
              >
                Disarm
              </button>
            ) : (
              <button
                type="button"
                onClick={live.arm}
                className="rounded-full border border-white/[0.10] bg-white/[0.05] px-3 py-1 text-[10.5px] font-semibold text-white/90 hover:bg-white/[0.08]"
              >
                Arm for {armWindowMin}m
              </button>
            )}
          </div>

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
          riskAck={riskAck}
          setRiskAck={setRiskAck}
          responsibilityAck={responsibilityAck}
          setResponsibilityAck={setResponsibilityAck}
          autoExecAck={autoExecAck}
          setAutoExecAck={setAutoExecAck}
          phrase={phrase}
          setPhrase={setPhrase}
          phraseMatches={phraseMatches}
          canEnable={canEnable}
          pending={live.pending}
          onClose={() => setOpen(false)}
          onEnable={async () => {
            await live.enable();
            live.arm();
            setOpen(false);
          }}
          armWindowMin={armWindowMin}
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

function formatRemaining(epochMs: number): string {
  const ms = Math.max(0, epochMs - Date.now());
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  if (minutes <= 0 && seconds <= 0) return "expired";
  if (minutes <= 0) return `${seconds}s left`;
  return `${minutes}m left`;
}

function ActivateModal({
  riskAck,
  setRiskAck,
  responsibilityAck,
  setResponsibilityAck,
  autoExecAck,
  setAutoExecAck,
  phrase,
  setPhrase,
  phraseMatches,
  canEnable,
  pending,
  onClose,
  onEnable,
  armWindowMin,
}: {
  riskAck: boolean;
  setRiskAck: (b: boolean) => void;
  responsibilityAck: boolean;
  setResponsibilityAck: (b: boolean) => void;
  autoExecAck: boolean;
  setAutoExecAck: (b: boolean) => void;
  phrase: string;
  setPhrase: (s: string) => void;
  phraseMatches: boolean;
  canEnable: boolean;
  pending: boolean;
  onClose: () => void;
  onEnable: () => void | Promise<void>;
  armWindowMin: number;
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
                Read carefully — this enables real broker orders.
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

        <ul className="space-y-2 text-[12px] leading-relaxed">
          <Check
            value={riskAck}
            onChange={setRiskAck}
            label="I understand trading involves real risk."
            sub="Past performance, AXE signals, and demo results do not guarantee future profit. I can lose more than I deposited on leveraged accounts."
          />
          <Check
            value={responsibilityAck}
            onChange={setResponsibilityAck}
            label="I am solely responsible for every order I send."
            sub="AXE does not auto‑execute. Every BUY / SELL is a deliberate action by me, not by the assistant."
          />
          <Check
            value={autoExecAck}
            onChange={setAutoExecAck}
            label="I will keep this device secure."
            sub={`Anyone with this unlocked device could place orders within the ${armWindowMin}‑minute arming window. I will lock the screen when I'm done.`}
          />
        </ul>

        <div className="mt-4">
          <label className="block text-[10px] font-medium uppercase tracking-widest text-tos-dim">
            Type the phrase to confirm
          </label>
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={`Type: ${REQUIRED_PHRASE}`}
            autoComplete="off"
            spellCheck={false}
            className={`mt-1 w-full rounded-lg border px-2.5 py-2 font-mono text-[12.5px] text-tos-text outline-none transition ${
              phrase.length === 0
                ? "border-white/10 bg-black/35"
                : phraseMatches
                  ? "border-white/[0.12] bg-white/[0.025]"
                  : "border-rose-400/30 bg-rose-400/[0.05]"
            }`}
          />
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

function Check({
  value,
  onChange,
  label,
  sub,
}: {
  value: boolean;
  onChange: (b: boolean) => void;
  label: string;
  sub: string;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 hover:bg-white/[0.04]">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 rounded border-white/20"
        />
        <span>
          <span className="font-semibold text-tos-text">{label}</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-tos-muted">{sub}</span>
        </span>
      </label>
    </li>
  );
}
