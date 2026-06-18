"use client";

import { useCallback, useState } from "react";
import { Zap } from "lucide-react";
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
}: {
  initialVolume: number;
  initialAlertAutoTrade: boolean;
}) {
  const [volume, setVolume] = useState(() => normalizeTradeVolume(initialVolume));
  const [alertAutoTrade, setAlertAutoTrade] = useState(initialAlertAutoTrade);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const persist = useCallback(async (nextVolume: number, nextAuto: boolean) => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/preferences/trade-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultVolume: nextVolume,
          alertAutoTradeEnabled: nextAuto,
        }),
        credentials: "include",
      });
      setSaved(true);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }, []);

  const selectVolume = (v: number) => {
    const next = normalizeTradeVolume(v);
    setVolume(next);
    void persist(next, alertAutoTrade);
  };

  const toggleAuto = () => {
    const next = !alertAutoTrade;
    setAlertAutoTrade(next);
    void persist(volume, next);
  };

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
      <header>
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          Trade size &amp; alerts
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          Default lot size for AXE drafts (Place on MT5) and optional alert auto-trade. Requires live
          trading enabled and a connected MT5 account.
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

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 accent-cyan-400"
          checked={alertAutoTrade}
          disabled={saving}
          onChange={toggleAuto}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white/90">
            <Zap className="h-3.5 w-3.5 text-cyan-300/80" aria-hidden />
            Alert → auto-trade (market)
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-tos-muted">
            When a price alert fires: <strong className="font-medium text-white/75">above</strong> →
            market buy, <strong className="font-medium text-white/75">below</strong> → market sell at
            your default lot size. High risk — only enable if you accept that.
          </span>
        </span>
      </label>

      <p className="mt-3 text-[10px] text-tos-dim">
        {saving ? "Saving…" : saved ? "Saved to your workspace." : "Syncs across devices."}
      </p>
    </section>
  );
}
