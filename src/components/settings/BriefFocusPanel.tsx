"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BRIEF_FOCUS,
  normalizeBriefFocusPrefs,
  type BriefFocus,
  type BriefFocusPrefs,
  type FocusPriority,
} from "@/lib/briefing/briefFocus";

type State = {
  prefs: BriefFocusPrefs;
  sources: { watchlist: string[]; traded: string[]; openPositions: string[] };
  preview: BriefFocus;
};

const COMMON = ["XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "US30", "SPX500", "NAS100", "GER40", "WTI", "BRENT"];

const REASON_LABEL: Record<string, string> = {
  selected: "chosen",
  watchlist: "watchlist",
  traded: "traded",
  open_position: "open position",
  weekend_crypto: "weekend only",
};

function Chip({ children, tone = "neutral", onClick, title }: { children: React.ReactNode; tone?: "neutral" | "primary" | "danger"; onClick?: () => void; title?: string }) {
  const cls =
    tone === "primary"
      ? "border-emerald-400/40 bg-emerald-400/[0.08] text-emerald-100"
      : tone === "danger"
        ? "border-rose-400/40 bg-rose-400/[0.08] text-rose-100"
        : "border-white/[0.08] bg-white/[0.03] text-white/80";
  return (
    <button type="button" title={title} onClick={onClick} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </button>
  );
}

/**
 * Settings → Morning brief focus. Which markets the morning brief, weekly
 * outlook and recap cover — and which they must never mention.
 */
export function BriefFocusPanel() {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<BriefFocusPrefs>(DEFAULT_BRIEF_FOCUS);
  const [input, setInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let alive = true;
    fetch("/api/preferences/brief-focus", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: State | null) => {
        if (!alive || !j) return;
        setState(j);
        setDraft(normalizeBriefFocusPrefs(j.prefs));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: BriefFocusPrefs) => {
    const clean = normalizeBriefFocusPrefs(next);
    setDraft(clean);
    setStatus("saving");
    try {
      const r = await fetch("/api/preferences/brief-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prefs: clean }),
      });
      const j = (await r.json()) as State & { ok?: boolean };
      if (!r.ok || !j.ok) throw new Error("save failed");
      setState(j);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, []);

  const suggestions = useMemo(() => {
    const have = new Set(draft.pairs.map((p) => p.symbol));
    const src = state?.sources;
    return [...new Set([...(src?.watchlist ?? []), ...(src?.traded ?? []), ...COMMON])].filter((s) => !have.has(s) && !draft.exclude.includes(s));
  }, [draft, state]);

  const addPair = (raw: string, priority: FocusPriority = "primary") => {
    const sym = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sym) return;
    void save({ ...draft, mode: "custom", pairs: [...draft.pairs, { symbol: sym, priority }] });
    setInput("");
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="flex gap-2">
        {(["auto", "custom"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => void save({ ...draft, mode: m })}
            aria-pressed={draft.mode === m}
            className={`flex-1 rounded-xl border px-3 py-2 text-left ${
              draft.mode === m ? "border-cyan-400/40 bg-cyan-400/[0.08]" : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <div className="text-[12px] font-medium text-white/90">{m === "auto" ? "Automatic" : "My own list"}</div>
            <div className="mt-0.5 text-[11px] text-tos-muted">
              {m === "auto" ? "Your watchlist + what you actually trade + open positions." : "Exactly the markets you pick below, nothing else."}
            </div>
          </button>
        ))}
      </div>

      {draft.mode === "custom" && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tos-dim">Markets · tap to switch primary / secondary</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {draft.pairs.length === 0 && <span className="text-tos-muted">None yet — add one below.</span>}
            {draft.pairs.map((p) => (
              <span key={p.symbol} className="inline-flex items-center gap-1">
                <Chip
                  tone={p.priority === "primary" ? "primary" : "neutral"}
                  title="Switch priority"
                  onClick={() =>
                    void save({
                      ...draft,
                      pairs: draft.pairs.map((x) => (x.symbol === p.symbol ? { ...x, priority: x.priority === "primary" ? "secondary" : "primary" } : x)),
                    })
                  }
                >
                  {p.symbol} · {p.priority}
                </Chip>
                <button
                  type="button"
                  aria-label={`Remove ${p.symbol}`}
                  className="text-tos-dim hover:text-white"
                  onClick={() => void save({ ...draft, pairs: draft.pairs.filter((x) => x.symbol !== p.symbol) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPair(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a market, e.g. XAUUSD"
              className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-white placeholder:text-tos-dim"
            />
            <button type="submit" className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-white/85">
              Add
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.slice(0, 12).map((s) => (
              <Chip key={s} onClick={() => addPair(s, "secondary")}>
                + {s}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tos-dim">Never mention</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {draft.exclude.map((s) => (
            <Chip key={s} tone="danger" title="Remove" onClick={() => void save({ ...draft, exclude: draft.exclude.filter((x) => x !== s) })}>
              {s} ×
            </Chip>
          ))}
          <form
            className="inline-flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const sym = excludeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
              if (sym) void save({ ...draft, exclude: [...draft.exclude, sym] });
              setExcludeInput("");
            }}
          >
            <input
              value={excludeInput}
              onChange={(e) => setExcludeInput(e.target.value)}
              placeholder="e.g. AUDUSD"
              className="w-28 rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1 text-white placeholder:text-tos-dim"
            />
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="text-white/85">Macro drivers</span>
            <span className="block text-[11px] text-tos-muted">DXY and US10Y for gold, Nasdaq for BTC … always labelled as drivers.</span>
          </span>
          <input type="checkbox" checked={draft.drivers} onChange={(e) => void save({ ...draft, drivers: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="text-white/85">Crypto on weekends</span>
            <span className="block text-[11px] text-tos-muted">When your markets are closed, cover BTCUSD as the one market that is open.</span>
          </span>
          <input type="checkbox" checked={draft.weekendCrypto} onChange={(e) => void save({ ...draft, weekendCrypto: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-white/85">Markets per brief</span>
          <select
            value={draft.maxMarkets}
            onChange={(e) => void save({ ...draft, maxMarkets: Number(e.target.value) })}
            className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1 text-white"
          >
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-tos-dim">Your next brief covers</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(state?.preview.markets ?? []).map((m) => (
            <span key={m.symbol} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-white/85">
              {m.symbol} <span className="text-tos-dim">· {m.reasons.map((r) => REASON_LABEL[r] ?? r).join(", ")}</span>
            </span>
          ))}
          {state && state.preview.markets.length === 0 && <span className="text-tos-muted">No markets yet — add some to your watchlist or list.</span>}
        </div>
        {state && state.preview.drivers.length > 0 && (
          <p className="mt-2 text-[11px] text-tos-muted">Drivers: {state.preview.drivers.map((d) => `${d.symbol} (${d.for.join("/")})`).join(" · ")}</p>
        )}
        <p className="mt-2 text-[11px] text-tos-muted">
          Calendar events only in: {state?.preview.currencies.join(", ") || "—"}. Weekends and holidays: closed markets only as “at the reopen”.
        </p>
      </div>
      <p className="text-[11px] text-tos-dim" aria-live="polite">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved — used from the next brief." : status === "error" ? "Could not save. Try again." : ""}
      </p>
    </div>
  );
}
