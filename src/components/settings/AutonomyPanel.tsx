"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { TosMatteBanner } from "@/components/ui/TosNotice";
import {
  AUTONOMY_ACK_KEYS,
  AUTONOMY_ACK_TEXT,
  AUTONOMY_LEVELS,
  AUTONOMY_MAX_LOT_CEILING,
  AUTONOMY_MAX_RISK_PCT_CEILING,
  AUTONOMY_MAX_TRADES_CEILING,
  DEFAULT_AUTONOMY,
  normalizeLimit,
  resolveAutonomy,
  type AutonomyAckKey,
  type AutonomyAcks,
  type AutonomyLevel,
  type AutonomySettings,
} from "@/lib/trading/autonomy";

/**
 * The three checkboxes, and the three numbers behind them.
 *
 * Before this panel there was one switch between "AXE suggests" and "AXE sends
 * live orders while you sleep", and every number the guard enforced came from
 * the broker or from a constant in the source. Nowhere had the trader said, in
 * their own words, how much they were willing to lose to a machine.
 *
 * The panel shows what *applies*, not what is stored: pick level 3 without
 * filling everything in and it says so, in the same words the feed will use
 * when an order is refused.
 */
export function AutonomyPanel({ initial }: { initial?: AutonomySettings }) {
  const start = initial ?? DEFAULT_AUTONOMY;
  // Per instance: two panels on one page shared a radio group when this was a
  // fixed string, so selecting a level in one cleared the other.
  const groupName = `autonomy-level-${useId()}`;
  const [level, setLevel] = useState<AutonomyLevel>(start.level);
  const [maxLot, setMaxLot] = useState(start.maxLot != null ? String(start.maxLot) : "");
  const [maxRisk, setMaxRisk] = useState(start.maxRiskPct != null ? String(start.maxRiskPct) : "");
  const [maxTrades, setMaxTrades] = useState(
    start.maxTradesPerDay != null ? String(start.maxTradesPerDay) : "",
  );
  const [acks, setAcks] = useState<AutonomyAcks>(start.acks);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = useMemo<AutonomySettings>(
    () => ({
      level,
      maxLot: normalizeLimit(maxLot, AUTONOMY_MAX_LOT_CEILING),
      maxRiskPct: normalizeLimit(maxRisk, AUTONOMY_MAX_RISK_PCT_CEILING),
      maxTradesPerDay: normalizeLimit(maxTrades, AUTONOMY_MAX_TRADES_CEILING),
      acks,
      grantedAt: start.grantedAt,
    }),
    [level, maxLot, maxRisk, maxTrades, acks, start.grantedAt],
  );

  // The same function the server and the guard use, so the panel cannot
  // promise a level the order path will not honour.
  const resolved = useMemo(() => resolveAutonomy(draft), [draft]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/preferences/trade-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          autonomyLevel: draft.level,
          autonomyMaxLot: draft.maxLot,
          autonomyMaxRiskPct: draft.maxRiskPct,
          autonomyMaxTradesPerDay: draft.maxTradesPerDay,
          autonomyAcks: draft.acks,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not save.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const toggleAck = (key: AutonomyAckKey) =>
    setAcks((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
      <header>
        <h2 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          <ShieldCheck className="h-3 w-3 text-cyan-300/80" aria-hidden />
          How much AXE may do on its own
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          This is the ceiling on everything automated — alerts that fire trades and drafts AXE
          places. Your account&apos;s own rules still apply on top, and where both set a limit the
          tighter one wins.
        </p>
      </header>

      <div className="mt-4 space-y-2">
        {AUTONOMY_LEVELS.map((option) => {
          const active = level === option.level;
          return (
            <label
              key={option.level}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                active
                  ? "border-cyan-400/40 bg-cyan-400/[0.07]"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]"
              }`}
            >
              <input
                type="radio"
                name={groupName}
                className="mt-0.5 h-4 w-4 accent-cyan-400"
                checked={active}
                onChange={() => setLevel(option.level)}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-white/90">{option.label}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-tos-muted">
                  {option.summary}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {level === 3 ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <LimitField
              label="Max lots per order"
              value={maxLot}
              onChange={setMaxLot}
              placeholder={`≤ ${AUTONOMY_MAX_LOT_CEILING}`}
            />
            <LimitField
              label="Max risk per trade (%)"
              value={maxRisk}
              onChange={setMaxRisk}
              placeholder={`≤ ${AUTONOMY_MAX_RISK_PCT_CEILING}`}
            />
            <LimitField
              label="Max trades per day"
              value={maxTrades}
              onChange={setMaxTrades}
              placeholder={`≤ ${AUTONOMY_MAX_TRADES_CEILING}`}
            />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
            AXE refuses an order that breaks one of these and says which. It never places a smaller
            trade instead. If it cannot work out what a trade risks — no stop, or no known balance —
            it refuses that too.
          </p>

          <div className="mt-4 space-y-2">
            {AUTONOMY_ACK_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 accent-cyan-400"
                  checked={acks[key]}
                  onChange={() => toggleAck(key)}
                />
                <span className="text-[11.5px] leading-relaxed text-tos-muted">
                  {AUTONOMY_ACK_TEXT[key]}
                </span>
              </label>
            ))}
          </div>
        </>
      ) : null}

      {resolved.downgraded ? (
        <TosMatteBanner accent="amber" className="mt-3">
          Not switched on yet — still missing {resolved.missing.join("; ")}. Until then AXE prepares
          the order and waits for you.
        </TosMatteBanner>
      ) : null}

      {error ? (
        <TosMatteBanner accent="amber" className="mt-2">
          {error}
        </TosMatteBanner>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-2 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-300/[0.14] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <p className="text-[10px] text-tos-dim">
          {saved
            ? `Saved. AXE is on “${AUTONOMY_LEVELS[resolved.level - 1].label}”.`
            : `Currently applies: “${AUTONOMY_LEVELS[resolved.level - 1].label}”.`}
        </p>
      </div>
    </section>
  );
}

function LimitField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <label className="text-[11px] text-tos-dim">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
      />
    </label>
  );
}
