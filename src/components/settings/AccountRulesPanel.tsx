"use client";

import { useCallback, useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { TosMatteBanner } from "@/components/ui/TosNotice";
import {
  EMPTY_ACCOUNT_RULES,
  MAX_DAILY_LOSS_PCT_CEILING,
  MAX_LOT_CEILING,
  type AccountTradingRules,
} from "@/lib/trading/accountRules";

type AccountRow = {
  id: string;
  label: string;
  server: string | null;
  rules: AccountTradingRules;
  profile: {
    kind: string;
    explicit: boolean;
    description: string;
  };
};

/**
 * "What are this account's rules?" — asked once, instead of guessed forever.
 *
 * `accountProfile` always promised that rules stated here win over its
 * heuristics. Nothing could state them until this panel existed, so every
 * funded account ran on a guess from its own name. On a $200,000 account with
 * a 4% daily limit, the guess was 5% — and AXE would have kept trading past
 * the point the account was already breached.
 */
export function AccountRulesPanel() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<AccountTradingRules>(EMPTY_ACCOUNT_RULES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/preferences/account-rules", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ accounts: AccountRow[] }>) : null))
      .then((body) => {
        if (!alive || !body) return;
        setAccounts(body.accounts);
        const first = body.accounts[0];
        if (first) {
          setSelected(first.id);
          setDraft(first.rules);
        }
      })
      .catch(() => {
        if (alive) setError("Could not load your accounts.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const current = accounts?.find((a) => a.id === selected) ?? null;

  const pick = (id: string) => {
    setSelected(id);
    setSaved(false);
    setError(null);
    setDraft(accounts?.find((a) => a.id === id)?.rules ?? EMPTY_ACCOUNT_RULES);
  };

  const save = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/preferences/account-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accountId: selected, rules: draft }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; rules?: AccountTradingRules; profile?: AccountRow["profile"] }
        | null;
      if (!res.ok || !body?.profile) {
        setError(body?.error ?? "Could not save.");
        return;
      }
      // Reflect what the server stored, not what we sent: the ceilings clamp.
      setDraft(body.rules ?? draft);
      setAccounts((prev) =>
        (prev ?? []).map((a) =>
          a.id === selected ? { ...a, rules: body.rules ?? a.rules, profile: body.profile! } : a,
        ),
      );
      setSaved(true);
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }, [selected, draft]);

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0c0d0e]/90 p-4">
      <header>
        <h2 className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-tos-dim">
          <Scale className="h-3 w-3 text-cyan-300/80" aria-hidden />
          This account&apos;s rules
        </h2>
        <p className="mt-1 text-xs text-tos-muted">
          AXE guesses these from the account name. Where the guess is wrong, say so here — what you
          state wins, and it is what the guard enforces before any automated order.
        </p>
      </header>

      {accounts === null ? (
        <p className="mt-4 text-[11px] text-tos-dim">Loading your accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="mt-4 text-[11px] text-tos-dim">Connect an account first.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                  a.id === selected
                    ? "border-cyan-400/40 bg-cyan-400/[0.12] text-cyan-100"
                    : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.14]"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          {current ? (
            <p className="mt-3 text-[10.5px] leading-relaxed text-tos-dim">
              AXE currently reads this as <span className="text-white/75">{current.profile.description}</span>
              {current.profile.explicit ? "" : " — a guess, until you state otherwise."}
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <NumberField
              label="Max daily loss (%)"
              value={draft.maxDailyLossPct}
              onChange={(v) => setDraft((d) => ({ ...d, maxDailyLossPct: v }))}
              placeholder={`e.g. 4 · ≤ ${MAX_DAILY_LOSS_PCT_CEILING}`}
            />
            <NumberField
              label="Max lots per position"
              value={draft.maxLot}
              onChange={(v) => setDraft((d) => ({ ...d, maxLot: v }))}
              placeholder={`≤ ${MAX_LOT_CEILING}`}
            />
          </div>

          <div className="mt-3 space-y-2">
            <TriState
              label="Trading through high-impact news"
              value={draft.newsTradingAllowed}
              onChange={(v) => setDraft((d) => ({ ...d, newsTradingAllowed: v }))}
            />
            <TriState
              label="Holding positions over the weekend"
              value={draft.weekendHoldingAllowed}
              onChange={(v) => setDraft((d) => ({ ...d, weekendHoldingAllowed: v }))}
            />
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-tos-dim">
            Leave a field on <span className="text-white/70">Not stated</span> and AXE keeps its own,
            more careful assumption. Stating a rule never loosens your broker&apos;s — where both set
            a limit the tighter one wins.
          </p>

          {error ? (
            <TosMatteBanner accent="amber" className="mt-3">
              {error}
            </TosMatteBanner>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !selected}
              className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-2 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-300/[0.14] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save rules"}
            </button>
            <p className="text-[10px] text-tos-dim">
              {saved ? "Saved — the guard uses these from the next order." : "Per account."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  placeholder: string;
}) {
  return (
    <label className="text-[11px] text-tos-dim">
      {label}
      <input
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          const n = Number(raw);
          onChange(raw === "" || !Number.isFinite(n) || n <= 0 ? null : n);
        }}
        placeholder={placeholder}
        inputMode="decimal"
        className="mt-1 w-full rounded-xl border border-white/10 bg-[#0c0d0e] px-3 py-2 font-mono text-[12px] text-tos-text outline-none focus:border-white/[0.15]"
      />
    </label>
  );
}

/**
 * Three states, not a checkbox: "allowed", "not allowed", and "I have not said".
 * A checkbox would turn silence into a claim, which is how a guess becomes a
 * rule nobody made.
 */
function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}) {
  const options: { v: boolean | null; t: string }[] = [
    { v: null, t: "Not stated" },
    { v: true, t: "Allowed" },
    { v: false, t: "Not allowed" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
      <span className="text-[11.5px] text-tos-muted">{label}</span>
      <span className="flex gap-1">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={`rounded-lg border px-2 py-1 text-[10.5px] transition-colors ${
              value === o.v
                ? "border-cyan-400/40 bg-cyan-400/[0.12] text-cyan-100"
                : "border-white/[0.08] text-white/55 hover:border-white/[0.14]"
            }`}
          >
            {o.t}
          </button>
        ))}
      </span>
    </div>
  );
}
