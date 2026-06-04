"use client";

/**
 * PinnedContext — chip-based context strip at the top of the chat view.
 *
 * Layout: pin icon → "Context" → XAUUSD chip → H1 chip → "+ add"
 *
 * Pair/TF selection lives here (moved from Composer). Tapping the pair
 * chip opens an inline edit; tapping TF cycles through timeframes.
 * The "+ add" label appears when neither pair nor TF is set.
 *
 * Reads/writes the same localStorage keys the Composer used to own:
 *   axe_active_symbol, axe_active_tf
 */

import { useEffect, useState, useRef } from "react";
import { Pin, X } from "lucide-react";

const LS_SYMBOL = "axe_active_symbol";
const LS_TF = "axe_active_tf";
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "D", "W"];

type PinnedContextProps = {
  /** Static pinned text from the server (legacy) — shown as a dim label when set. */
  text: string;
};

export function PinnedContext({ text }: PinnedContextProps) {
  const [symbol, setSymbol] = useState("");
  const [tf, setTf] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage (SSR-safe)
  useEffect(() => {
    setSymbol(localStorage.getItem(LS_SYMBOL) ?? "");
    setTf(localStorage.getItem(LS_TF) ?? "");
  }, []);

  // Focus input when editing opens
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function openEdit() {
    setDraft(symbol);
    setEditing(true);
  }

  function commitSymbol() {
    const upper = draft.trim().toUpperCase();
    setSymbol(upper);
    if (upper) localStorage.setItem(LS_SYMBOL, upper);
    else localStorage.removeItem(LS_SYMBOL);
    setEditing(false);
  }

  function cycleTf() {
    const idx = tf ? TIMEFRAMES.indexOf(tf) : -1;
    const next = idx === TIMEFRAMES.length - 1 ? "" : (TIMEFRAMES[idx + 1] ?? "");
    setTf(next);
    if (next) localStorage.setItem(LS_TF, next);
    else localStorage.removeItem(LS_TF);
  }

  function clearAll() {
    setSymbol("");
    setTf("");
    setEditing(false);
    localStorage.removeItem(LS_SYMBOL);
    localStorage.removeItem(LS_TF);
  }

  const hasContext = Boolean(symbol || tf);

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.015] px-3 py-2">
      {/* Pin icon + label */}
      <Pin className="h-3 w-3 shrink-0 text-white/30" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">
        Context
      </span>

      {/* Pair chip */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onBlur={commitSymbol}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitSymbol(); }
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="XAUUSD"
          className="w-20 rounded-lg border border-[rgba(0,212,245,0.25)] bg-[rgba(0,212,245,0.06)] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#00d4f5] focus:border-[rgba(0,212,245,0.5)] focus:outline-none"
          maxLength={10}
        />
      ) : (
        <button
          type="button"
          onClick={openEdit}
          className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] tracking-wider transition-colors active:scale-95 ${
            symbol
              ? "border-[rgba(0,212,245,0.15)] bg-[rgba(0,212,245,0.06)] text-[#00d4f5] hover:bg-[rgba(0,212,245,0.1)]"
              : "border-white/[0.06] bg-white/[0.03] text-white/25 hover:border-white/10 hover:text-white/40"
          }`}
        >
          {symbol || "+ pair"}
        </button>
      )}

      {/* TF chip */}
      <button
        type="button"
        onClick={cycleTf}
        className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] tracking-wider transition-colors active:scale-95 ${
          tf
            ? "border-[rgba(0,212,245,0.15)] bg-[rgba(0,212,245,0.06)] text-[#00d4f5] hover:bg-[rgba(0,212,245,0.1)]"
            : "border-white/[0.06] bg-white/[0.03] text-white/25 hover:border-white/10 hover:text-white/40"
        }`}
      >
        {tf || "tf"}
      </button>

      {/* "+ add" — when nothing is set */}
      {!hasContext && (
        <button
          type="button"
          onClick={openEdit}
          className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
        >
          + add
        </button>
      )}

      {/* Spacer + clear */}
      <div className="flex-1" />

      {hasContext && (
        <button
          type="button"
          onClick={clearAll}
          className="text-white/15 hover:text-white/30 transition-colors"
          aria-label="Clear context"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Legacy pinned text (dim, after chips) */}
      {text && !hasContext ? (
        <span className="truncate text-[10px] text-white/20">{text}</span>
      ) : null}
    </div>
  );
}
