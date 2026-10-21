"use client";

import { useCallback, useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { TosMatteBanner } from "@/components/ui/TosNotice";
import {
  EMPTY_ACCOUNT_RULES,
  MAX_DAILY_LOSS_PCT_CEILING,
  MAX_LOT_CEILING,
  MAX_TOTAL_LOSS_PCT_CEILING,
  type AccountTradingRules,
} from "@/lib/trading/accountRules";

type ConstraintSource = "stated" | "firm" | "default";

type AccountRow = {
  id: string;
  label: string;
  server: string | null;
  rules: AccountTradingRules;
  profile: {
    kind: string;
    explicit: boolean;
    description: string;
    newsTradingAllowed: boolean;
    weekendHoldingAllowed: boolean;
    maxDailyLossPct: number | null;
    maxTotalLossPct: number | null;
    maxLot: number | null;
    provenance: Record<string, ConstraintSource>;
    firm: {
      name: string;
      model: string | null;
      models: string[];
      tightestAcrossModels: boolean;
      source: string | null;
      asOf: string | null;
    } | null;
  };
};

/**
 * "Here is what AXE worked out. Is that right?" — not "type in your rulebook".
 *
 * This panel started as a form. That was the wrong shape and Luka said so:
 * a trader who already chose their firm, paid their firm and passed their
 * firm's evaluation should not then have to copy the firm's rules into an app.
 * It is homework, and homework is the thing people skip — leaving every funded
 * account running on a guess, which is the exact failure the panel was built
 * to fix.
 *
 * So the order is inverted. AXE reads the MT5 server name, names the firm, and
 * shows the limits it will actually enforce with a badge saying where each one
 * came from: the firm's own published rules, a careful default, or the
 * trader's own word. Where a firm's limits differ per account model — FTMO is
 * 3% daily on two of its three and 5% on the other — it asks one answerable
 * question with the models as buttons, and uses the strictest until told.
 * Typing is what is left for the cases AXE genuinely cannot know.
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

  /**
   * One tap on "2-Step" and AXE has FTMO's real numbers for that account.
   *
   * It saves straight away rather than waiting for the Save button, because
   * this is not a rule the trader is stating — it is them answering a question
   * AXE asked, and the answer changes every number on screen. Making them
   * press Save afterwards would leave the panel showing the strictest-model
   * figures next to the model they just picked.
   */
  const pickModel = useCallback(
    async (model: string | null) => {
      if (!selected) return;
      const next = { ...draft, firmModel: model };
      setDraft(next);
      setSaved(false);
      setError(null);
      setSaving(true);
      try {
        const res = await fetch("/api/preferences/account-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ accountId: selected, rules: next }),
        });
        const body = (await res.json().catch(() => null)) as
          | { error?: string; rules?: AccountTradingRules; profile?: AccountRow["profile"] }
          | null;
        if (!res.ok || !body?.profile) {
          setError(body?.error ?? "Could not save.");
          return;
        }
        setDraft(body.rules ?? next);
        setAccounts((prev) =>
          (prev ?? []).map((a) =>
            a.id === selected ? { ...a, rules: body.rules ?? a.rules, profile: body.profile! } : a,
          ),
        );
      } catch {
        setError("Could not save.");
      } finally {
        setSaving(false);
      }
    },
    [selected, draft],
  );

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
          AXE works these out from your account and shows you where each one came from. Correct
          anything that is wrong — what you state wins, and it is what the guard enforces before any
          automated order.
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

          {current ? <DetectedSummary row={current} onPickModel={pickModel} /> : null}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <NumberField
              label="Max daily loss (%)"
              value={draft.maxDailyLossPct}
              onChange={(v) => setDraft((d) => ({ ...d, maxDailyLossPct: v }))}
              placeholder={`e.g. 4 · ≤ ${MAX_DAILY_LOSS_PCT_CEILING}`}
            />
            <NumberField
              label="Max total drawdown (%)"
              value={draft.maxTotalLossPct}
              onChange={(v) => setDraft((d) => ({ ...d, maxTotalLossPct: v }))}
              placeholder={`e.g. 10 · ≤ ${MAX_TOTAL_LOSS_PCT_CEILING}`}
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

/** stated / firm / default, in one word a trader can act on. */
function SourceBadge({ source, firmName }: { source: ConstraintSource; firmName?: string | null }) {
  const style =
    source === "stated"
      ? "border-cyan-400/35 bg-cyan-400/[0.10] text-cyan-100"
      : source === "firm"
        ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100/90"
        : "border-amber-300/25 bg-amber-300/[0.07] text-amber-100/85";
  const text =
    source === "stated" ? "you said" : source === "firm" ? firmName ?? "the firm" : "assumed";
  return (
    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] ${style}`}>{text}</span>
  );
}

function pctOrDash(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/**
 * What AXE already knows about this account, before the trader types anything.
 *
 * The whole point of the panel: the limits that are protecting them right now,
 * each labelled with where it came from, and — where a firm's rules differ per
 * account model — the one question worth asking, as buttons.
 */
function DetectedSummary({
  row,
  onPickModel,
}: {
  row: AccountRow;
  onPickModel: (model: string | null) => void;
}) {
  const { profile } = row;
  const firm = profile.firm;
  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: "maxDailyLossPct", label: "Daily loss cap", value: pctOrDash(profile.maxDailyLossPct) },
    { key: "maxTotalLossPct", label: "Total drawdown cap", value: pctOrDash(profile.maxTotalLossPct) },
    {
      key: "newsTradingAllowed",
      label: "Trading through news",
      value: profile.newsTradingAllowed ? "allowed" : "not allowed",
    },
    {
      key: "weekendHoldingAllowed",
      label: "Holding over the weekend",
      value: profile.weekendHoldingAllowed ? "allowed" : "not allowed",
    },
  ];

  return (
    <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-[10.5px] leading-relaxed text-tos-muted">
        {profile.description}
      </p>

      <dl className="mt-2.5 space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-2">
            <dt className="text-[10.5px] text-tos-dim">{r.label}</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] tabular-nums text-white/80">{r.value}</span>
              <SourceBadge source={profile.provenance[r.key] ?? "default"} firmName={firm?.name} />
            </dd>
          </div>
        ))}
      </dl>

      {firm && firm.models.length > 0 ? (
        <div className="mt-3 border-t border-white/[0.06] pt-2.5">
          <p className="text-[10.5px] leading-relaxed text-tos-muted">
            Which {firm.name} account is this? AXE is using the strictest of them until you say.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {firm.models.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => onPickModel(model)}
                className="rounded-lg border border-white/[0.1] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/75 transition-colors hover:border-emerald-300/40 hover:text-emerald-100"
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {firm?.model ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2.5">
          <span className="text-[10.5px] text-tos-dim">
            Read as {firm.name} {firm.model}
            {firm.asOf ? ` · rules read ${firm.asOf}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onPickModel(null)}
            className="rounded-lg border border-white/[0.1] px-2 py-0.5 text-[10px] text-white/55 transition-colors hover:border-white/[0.2] hover:text-white/80"
          >
            Not this one
          </button>
        </div>
      ) : null}

      {firm?.source ? (
        // A number with no provenance is a number a trader has to take on
        // faith, and prop firm rules change. Saying where it was read lets
        // them check it in ten seconds.
        <p className="mt-2 break-words text-[9.5px] leading-relaxed text-tos-dim/80">
          Source: {firm.source}
        </p>
      ) : null}
    </div>
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
