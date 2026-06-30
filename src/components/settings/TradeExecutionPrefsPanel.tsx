"use client";

import { useCallback, useState } from "react";
import { Zap } from "lucide-react";
import { TosMatteBanner } from "@/components/ui/TosNotice";
import { RiskConfirmationModal } from "@/components/risk/RiskConfirmationModal";
import {
  DEFAULT_TRADE_VOLUME_LOTS,
  MAX_TRADE_VOLUME_LOTS,
  MIN_TRADE_VOLUME_LOTS,
  normalizeTradeVolume,
} from "@/lib/trading/tradeVolume";

const PRESETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1] as const;

export function TradeExecutionPrefsPanel({
  initialVolume,
  initialAlertAutoTrade,
  initialAlertSlOffset,
  initialAlertTpOffset,
  liveTradingEnabled = false,
}: {
  initialVolume: number;
  initialAlertAutoTrade: boolean;
  initialAlertSlOffset: number | null;
  initialAlertTpOffset: number | null;
  liveTradingEnabled?: boolean;
}) {
  const [volume, setVolume] = useState(() => normalizeTradeVolume(initialVolume));
  const [alertAutoTrade, setAlertAutoTrade] = useState(initialAlertAutoTrade);
  const [slOffset, setSlOffset] = useState(
    () => (initialAlertSlOffset != null ? String(initialAlertSlOffset) : ""),
  );
  const [tpOffset, setTpOffset] = useState(
    () => (initialAlertTpOffset != null ? String(initialAlertTpOffset) : ""),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const persist = useCallback(
    async (next: {
      volume: number;
      auto: boolean;
      sl: string;
      tp: string;
    }) => {
      setSaving(true);
      setSaved(false);
      setError(null);
      const slNum = next.sl.trim() === "" ? null : Number(next.sl);
      const tpNum = next.tp.trim() === "" ? null : Number(next.tp);
      try {
        const res = await fetch("/api/preferences/trade-execution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultVolume: next.volume,
            alertAutoTradeEnabled: next.auto,
            alertSlOffset: slNum,
            alertTpOffset: tpNum,
          }),
          credentials: "include",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(j?.error ?? "Could not save.");
          return;
        }
        setSaved(true);
      } catch {
        setError("Could not save.");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const selectVolume = (v: number) => {
    const next = normalizeTradeVolume(v);
    setVolume(next);
    void persist({ volume: next, auto: alertAutoTrade, sl: slOffset, tp: tpOffset });
  };

  const saveOffsets = () => {
    void persist({ volume, auto: alertAutoTrade, sl: slOffset, tp: tpOffset });
  };

  const applyAutoToggle = (next: boolean) => {
    if (next) {
      if (!liveTradingEnabled) {
        setError("Enable Live trading first (same 3-step risk confirmation) before auto-trade on alerts.");
        return;
      }
      const slNum = slOffset.trim() === "" ? null : Number(slOffset);
      const tpNum = tpOffset.trim() === "" ? null : Number(tpOffset);
      if (slNum == null || tpNum == null || !Number.isFinite(slNum) || !Number.isFinite(tpNum) || slNum <= 0 || tpNum <= 0) {
        setError("Set default SL and TP distance (price units) before enabling alert auto-trade.");
        return;
      }
    }
    setAlertAutoTrade(next);
    void persist({ volume, auto: next, sl: slOffset, tp: tpOffset });
  };

  const toggleAuto = () => {
    const next = !alertAutoTrade;
    if (next && !alertAutoTrade) {
      setConfirmOpen(true);
      return;
    }
    applyAutoToggle(next);
  };

  return (
    <>
      <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
      <header>
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Trade size &amp; alerts
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          Default lot size for AXE drafts and alert auto-trade. Auto-trade always sends SL/TP — set
          defaults here and confirm prices on each alert.
        </p>
      </header>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Default lots</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((v) => {
            const active = volume === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => selectVolume(v)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                  active
                    ? "border-cyan-400/40 bg-cyan-400/[0.12] text-cyan-100"
                    : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.14]"
                }`}
              >
                {v.toFixed(v < 0.1 ? 2 : 1)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-tos-dim">
          Range {MIN_TRADE_VOLUME_LOTS}–{MAX_TRADE_VOLUME_LOTS} lots · default {DEFAULT_TRADE_VOLUME_LOTS}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-tos-dim">
          Default SL distance (price)
          <input
            value={slOffset}
            onChange={(e) => setSlOffset(e.target.value)}
            onBlur={saveOffsets}
            placeholder="e.g. 5 for XAUUSD"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
          />
        </label>
        <label className="text-[11px] text-tos-dim">
          Default TP distance (price)
          <input
            value={tpOffset}
            onChange={(e) => setTpOffset(e.target.value)}
            onBlur={saveOffsets}
            placeholder="e.g. 10 for XAUUSD"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
          />
        </label>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
        Used to pre-fill each alert&apos;s SL/TP from the threshold. You still confirm exact prices on
        the alert before save.
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 accent-cyan-400"
          checked={alertAutoTrade}
          disabled={saving || !liveTradingEnabled}
          onChange={toggleAuto}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white/90">
            <Zap className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
            Alert → auto-trade (market + SL/TP)
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-tos-muted">
            When a price alert fires: choose buy or sell separately from the trigger (above/below).
            Orders always include SL/TP prices — no naked trades.
          </span>
        </span>
      </label>

      {error ? (
        <TosMatteBanner accent="amber" className="mt-2">
          {error}
        </TosMatteBanner>
      ) : null}
      {!liveTradingEnabled ? (
        <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
          Auto-trade is locked until Live trading is enabled with the full 3-step risk acknowledgment.
        </p>
      ) : null}
      <p className="mt-3 text-[10px] text-tos-dim">
        {saving ? "Saving…" : saved ? "Saved to your workspace." : "Syncs across devices."}
      </p>
      </section>
      <RiskConfirmationModal
        open={confirmOpen}
        pending={saving}
        title="Enable alert auto-trade"
        subtitle="Alerts can submit market orders with SL/TP automatically when armed."
        confirmLabel="Enable auto-trade"
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          applyAutoToggle(true);
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
