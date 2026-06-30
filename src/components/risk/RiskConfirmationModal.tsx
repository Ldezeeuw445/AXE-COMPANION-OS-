"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const REQUIRED_PHRASE = "I am responsible";

export function RiskConfirmationModal({
  open,
  title,
  subtitle,
  confirmLabel = "Confirm",
  pending = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  confirmLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [riskAck, setRiskAck] = useState(false);
  const [responsibilityAck, setResponsibilityAck] = useState(false);
  const [deviceAck, setDeviceAck] = useState(false);
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    if (!open) {
      setRiskAck(false);
      setResponsibilityAck(false);
      setDeviceAck(false);
      setPhrase("");
    }
  }, [open]);

  if (!open) return null;

  const phraseMatches = phrase.trim() === REQUIRED_PHRASE;
  const canConfirm = riskAck && responsibilityAck && deviceAck && phraseMatches && !pending;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/72 p-4 backdrop-blur sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-2xl border border-rose-400/30 bg-[#060a14] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-rose-400/35 bg-rose-400/10">
              <AlertTriangle className="h-4 w-4 text-rose-300" aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-tos-text">{title}</p>
              <p className="mt-0.5 text-[11px] text-tos-muted">{subtitle}</p>
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
            sub="Past performance, AXE signals, and demo results do not guarantee future profit."
          />
          <Check
            value={responsibilityAck}
            onChange={setResponsibilityAck}
            label="I am solely responsible for every order I send."
            sub="Every action stays my own responsibility."
          />
          <Check
            value={deviceAck}
            onChange={setDeviceAck}
            label="I will keep this device secure."
            sub="I will lock my device and prevent unauthorized trade actions."
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
                ? "border-white/10 bg-[#0c0d0e]"
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
            onClick={() => void onConfirm()}
            disabled={!canConfirm}
            className="rounded-xl border border-rose-400/40 bg-rose-400/12 px-4 py-2.5 text-[12px] font-semibold text-rose-100/95 hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? "Saving..." : confirmLabel}
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
