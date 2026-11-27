"use client";

/**
 * "How AXE learns you" — learning model v2 in the cockpit.
 *
 * Every number on this card traces back to rows the trader can check: closed
 * trades, AXE's per-trade reviews, thumbs on AXE replies. No smoothing, no
 * volume bonus, no default. While there is too little data it says how far
 * along it is instead of showing a score. The trader can correct, hide or
 * reset anything AXE learned.
 */
import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type {
  LearningChange,
  LearningComponent,
  LearningConfidence,
  LearningHistoryPoint,
  LearningState,
  LearnedItem,
  UnknownItem,
} from "@/lib/axe/learningModel";

export type LearningModelPayload = {
  state: LearningState;
  changes: LearningChange[];
  history: LearningHistoryPoint[];
  overridesAvailable: boolean;
};

type Props = {
  initial?: LearningModelPayload | null;
  /** Probe/screenshot mode: no network, buttons disabled. */
  readOnly?: boolean;
};

const CONF_STYLE: Record<LearningConfidence, string> = {
  insufficient: "border-white/10 bg-white/[0.03] text-tos-dim",
  low: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  medium: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  high: "border-emerald-400/35 bg-emerald-500/10 text-emerald-300",
};
const CONF_LABEL: Record<LearningConfidence, string> = {
  insufficient: "Not enough data",
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

function scoreTone(score: number | null): string {
  if (score == null) return "bg-white/10";
  if (score >= 70) return "bg-emerald-400";
  if (score >= 50) return "bg-amber-400";
  return "bg-tos-short";
}
function scoreText(score: number | null): string {
  if (score == null) return "text-tos-dim";
  if (score >= 70) return "text-emerald-300";
  if (score >= 50) return "text-amber-200";
  return "text-tos-short";
}

const CHANGE_STYLE: Record<LearningChange["kind"], { label: string; cls: string }> = {
  new: { label: "New", cls: "border-sky-400/30 bg-sky-500/10 text-sky-200" },
  strengthened: { label: "Stronger", cls: "border-emerald-400/35 bg-emerald-500/10 text-emerald-300" },
  weakened: { label: "Weaker", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" },
  updated: { label: "Updated", cls: "border-white/15 bg-white/[0.05] text-tos-muted" },
  lost: { label: "Lost", cls: "border-tos-short/40 bg-tos-short/10 text-tos-short" },
  score: { label: "Score", cls: "border-white/15 bg-white/[0.05] text-tos-text" },
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tos-dim">{children}</p>
  );
}

function HistoryChart({ points }: { points: LearningHistoryPoint[] }) {
  const w = 300;
  const h = 72;
  const n = points.length;
  if (n === 0) return null;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 8) + 4);
  const y = (s: number) => h - 6 - (s / 100) * (h - 12);
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.score == null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`;
  });
  if (current) segments.push(current);
  const scored = points.filter((p) => p.score != null).length;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full" role="img" aria-label="AXE fit over the last 12 weeks">
        {[25, 50, 75].map((g) => (
          <line key={g} x1="0" x2={w} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--tos-long)" strokeWidth="2" strokeLinejoin="round" />
        ))}
        {points.map((p, i) =>
          p.score == null ? (
            <circle key={i} cx={x(i)} cy={h - 6} r="2" fill="rgba(255,255,255,0.18)" />
          ) : (
            <circle key={i} cx={x(i)} cy={y(p.score)} r="2.6" fill="var(--tos-long)" />
          ),
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-tos-dim">
        <span>{new Date(points[0]!.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        <span>
          {scored === 0
            ? "No week had enough data for a score yet"
            : `${scored} of ${n} weeks scored · grey dots = still learning`}
        </span>
        <span>{new Date(points[n - 1]!.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
      </div>
    </div>
  );
}

function ComponentRow({
  c,
  onReset,
  disabled,
}: {
  c: LearningComponent;
  onReset: (family: string) => void;
  disabled: boolean;
}) {
  return (
    <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" data-testid={`learning-component-${c.key}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[13px] font-medium text-tos-text">{c.label}</span>
          <span className="text-[10px] tabular-nums text-tos-dim">weight {Math.round(c.weight * 100)}%</span>
          {c.userAdjusted ? <Chip className="border-white/15 bg-white/[0.05] text-tos-muted">Adjusted by you</Chip> : null}
        </div>
        <span className={`font-mono text-[13px] font-semibold tabular-nums ${scoreText(c.score)}`}>
          {c.score == null ? "—" : `${c.score}%`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
        <div
          className={`h-full rounded-full ${scoreTone(c.score)}`}
          style={{ width: `${c.score == null ? Math.min(100, (c.sample / Math.max(1, c.minSample)) * 100) : c.score}%`, opacity: c.score == null ? 0.35 : 1 }}
        />
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-tos-muted">{c.explanation}</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Chip className={CONF_STYLE[c.confidence]}>{CONF_LABEL[c.confidence]}</Chip>
          <span className="text-[10.5px] tabular-nums text-tos-dim">
            {c.score == null ? `Needs ${c.needs}` : `${c.sample} data points · min ${c.minSample}`}
          </span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onReset(c.key)}
          className="text-[10.5px] text-tos-dim underline-offset-2 hover:text-tos-text hover:underline disabled:opacity-40"
        >
          Reset this
        </button>
      </div>
    </li>
  );
}

function ItemRow({
  item,
  disabled,
  onAction,
}: {
  item: LearnedItem;
  disabled: boolean;
  onAction: (body: { itemKey: string; action: string; value?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const correctable = item.key === "session:main" || item.key.startsWith("instrument:");
  const correctionKey = item.key === "session:main" ? "timing" : "focus";
  return (
    <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" data-testid={`learning-item-${item.key}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-tos-text">{item.label}</span>
        <span className="font-mono text-[12px] tabular-nums text-tos-text">{item.value}</span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-tos-muted">
        {item.detail}
        {item.learnedValue ? <span className="text-tos-dim"> AXE measured: {item.learnedValue}.</span> : null}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {item.status === "corrected" ? (
            <Chip className="border-white/15 bg-white/[0.05] text-tos-muted">Set by you</Chip>
          ) : (
            <Chip className={CONF_STYLE[item.confidence]}>{CONF_LABEL[item.confidence]}</Chip>
          )}
          <span className="text-[10.5px] tabular-nums text-tos-dim">from {item.sample}</span>
        </div>
        <div className="flex items-center gap-3 text-[10.5px] text-tos-dim">
          {correctable ? (
            <button type="button" disabled={disabled} onClick={() => setEditing((e) => !e)} className="hover:text-tos-text disabled:opacity-40">
              Correct
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction({ itemKey: item.key, action: "hide" })}
            className="hover:text-tos-text disabled:opacity-40"
          >
            Hide
          </button>
          {item.status === "corrected" ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction({ itemKey: correctionKey, action: "undo" })}
              className="hover:text-tos-text disabled:opacity-40"
            >
              Undo
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value) return;
            onAction({ itemKey: correctionKey, action: "correct", value });
            setEditing(false);
          }}
        >
          {item.key === "session:main" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-lg border border-white/10 bg-black px-2 py-1 text-[12px] text-tos-text"
            >
              <option value="">My main session is…</option>
              <option value="london">London</option>
              <option value="newyork">New York</option>
              <option value="asia">Asia</option>
            </select>
          ) : (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="XAUUSD, BTCUSD"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-2 py-1 text-[12px] text-tos-text"
            />
          )}
          <button type="submit" className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-tos-text">
            Save
          </button>
        </form>
      ) : null}
    </li>
  );
}

function UnknownRow({ u }: { u: UnknownItem }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/[0.08] px-3 py-2">
      <span className="text-[11.5px] leading-relaxed text-tos-muted">{u.text}</span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-tos-dim">
        {Math.min(u.have, u.need)}/{u.need}
      </span>
    </li>
  );
}

export function CockpitLearningModel({ initial = null, readOnly = false }: Props) {
  const [data, setData] = useState<LearningModelPayload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cockpit/learning", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json as LearningModelPayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!readOnly && !initial) void load();
  }, [readOnly, initial, load]);

  const act = useCallback(
    async (body: { itemKey: string; action: string; value?: string }) => {
      if (readOnly) return;
      setBusy(true);
      try {
        const res = await fetch("/api/cockpit/learning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        if (json?.state) setData(json as LearningModelPayload);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [readOnly],
  );

  if (!data) {
    return (
      <GlassPanel className="p-5" >
        <SectionLabel>How AXE learns you</SectionLabel>
        <p className="mt-2 text-sm text-tos-muted">
          {error ? `Could not load your learning data (${error}). Nothing is shown rather than a guess.` : "Loading what AXE has learned…"}
        </p>
        {error ? (
          <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-white/15 px-3 py-1 text-[11px] text-tos-text">
            Retry
          </button>
        ) : null}
      </GlassPanel>
    );
  }

  const { state, changes, history, overridesAvailable } = data;
  const disabled = readOnly || busy || !overridesAvailable;
  const progress = Math.min(100, (Math.min(state.dataPoints, state.requiredPoints) / state.requiredPoints) * 100);

  return (
    <GlassPanel className="p-5" >
      <div data-testid="cockpit-learning-model" className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionLabel>How AXE learns you</SectionLabel>
            <p className="mt-2 text-sm leading-snug text-tos-text">{state.headline}</p>
            <p className="mt-1 text-[11px] text-tos-dim">
              Across {state.counts.accounts} account{state.counts.accounts === 1 ? "" : "s"} · last {state.windowDays} days ·
              {" "}{state.counts.labelled} of {state.counts.trades} trades reviewed by AXE
            </p>
          </div>
          <div className="shrink-0 text-right">
            {state.score == null ? (
              <>
                <p className="text-[1.35rem] font-semibold leading-none text-tos-text">Learning</p>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-tos-dim">
                  {Math.min(state.dataPoints, state.requiredPoints)}/{state.requiredPoints} data points
                </p>
              </>
            ) : (
              <>
                <p className={`text-[2rem] font-bold leading-none tabular-nums ${scoreText(state.score)}`}>
                  {state.score}
                  <span className="text-[12px] font-medium text-tos-dim"> /100</span>
                </p>
                <div className="mt-1.5">
                  <Chip className={CONF_STYLE[state.confidence]}>{CONF_LABEL[state.confidence]}</Chip>
                </div>
              </>
            )}
          </div>
        </div>

        {state.score == null ? (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
              <div className="h-full rounded-full bg-[color:var(--tos-long)]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-tos-dim">
              A score appears at {state.requiredPoints} data points (closed trades + rated replies) with at least{" "}
              {state.requiredComponents} measurable parts. Now: {state.readyComponents} of {state.requiredComponents}.
            </p>
          </div>
        ) : null}

        {/* History */}
        <div>
          <SectionLabel>AXE fit · last 12 weeks</SectionLabel>
          <div className="mt-2">
            <HistoryChart points={history} />
          </div>
        </div>

        {/* Components */}
        <div>
          <SectionLabel>What the score is made of</SectionLabel>
          <ul className="mt-2 space-y-2">
            {state.components.map((c) => (
              <ComponentRow key={c.key} c={c} disabled={disabled} onReset={(family) => void act({ itemKey: family, action: "reset" })} />
            ))}
          </ul>
        </div>

        {/* Change log */}
        <div>
          <SectionLabel>What AXE learned this week</SectionLabel>
          {changes.length === 0 ? (
            <p className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12px] text-tos-muted">
              Nothing new this week: no closed trades or rated replies changed what AXE knows.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {changes.map((ch, i) => (
                <li key={`${ch.key}-${i}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Chip className={CHANGE_STYLE[ch.kind].cls}>{CHANGE_STYLE[ch.kind].label}</Chip>
                    <p className="min-w-0 text-[12px] leading-relaxed text-tos-text">{ch.text}</p>
                  </div>
                  <p className="mt-1 pl-1 text-[10.5px] tabular-nums text-tos-dim">
                    Source: {ch.evidence.trades} trade{ch.evidence.trades === 1 ? "" : "s"}
                    {ch.evidence.votes ? ` · ${ch.evidence.votes} rated repl${ch.evidence.votes === 1 ? "y" : "ies"}` : ""}
                    {ch.evidence.symbols.length ? ` · ${ch.evidence.symbols.join(", ")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Learned items */}
        <div>
          <SectionLabel>What AXE knows about you</SectionLabel>
          {state.items.length === 0 ? (
            <p className="mt-2 text-[12px] text-tos-muted">Nothing yet with enough data behind it.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {state.items.map((item) => (
                <ItemRow key={item.key} item={item} disabled={disabled} onAction={(b) => void act(b)} />
              ))}
            </ul>
          )}
        </div>

        {/* Unknowns */}
        {state.unknowns.length > 0 ? (
          <div>
            <SectionLabel>Still unknown</SectionLabel>
            <ul className="mt-2 space-y-1.5">
              {state.unknowns.map((u) => (
                <UnknownRow key={u.key} u={u} />
              ))}
            </ul>
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
          <details className="text-[11px] text-tos-dim">
            <summary className="cursor-pointer hover:text-tos-text">How this score works</summary>
            <p className="mt-1.5 max-w-prose leading-relaxed">
              Weighted average of the parts that have enough data (setup fit 35%, feedback 20%, risk 20%, session 15%,
              instruments 10%), over your closed trades on all accounts in the last {state.windowDays} days. No
              smoothing and no bonus for activity: the same trades always give the same number. Below{" "}
              {state.requiredPoints} data points or {state.requiredComponents} measurable parts there is no score.
            </p>
          </details>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (window.confirm("Reset everything AXE learned? Trades and replies before now will be ignored.")) {
                void act({ itemKey: "all", action: "reset" });
              }
            }}
            className="rounded-lg border border-tos-short/30 px-2.5 py-1 text-[11px] text-tos-short hover:bg-tos-short/10 disabled:opacity-40"
          >
            Reset all learning
          </button>
        </div>
        {!overridesAvailable && !readOnly ? (
          <p className="text-[10.5px] text-tos-dim">Corrections are switched off until the learning tables are installed.</p>
        ) : null}
        {error ? <p className="text-[11px] text-tos-short">{error}</p> : null}
      </div>
    </GlassPanel>
  );
}
