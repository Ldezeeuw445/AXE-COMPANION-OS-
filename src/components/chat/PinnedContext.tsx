"use client";

/**
 * PinnedContext — chip-based context strip at the top of the chat view.
 *
 * Layout: [XAUUSD ▾] [H1 ▾] 📌 Session brief text... >
 *
 * Left side:
 *   - Pair chip: tap to open inline edit (type symbol, enter/blur to commit)
 *   - TF chip: tap to cycle through timeframes
 *
 * Right side:
 *   - Red pin icon + pinned context text (truncated) + chevron
 *   - Tapping the pin/text area navigates to /settings
 *
 * Reads/writes localStorage:
 *   axe_active_symbol, axe_active_tf
 */

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Pin, ChevronRight } from "lucide-react";

const LS_SYMBOL = "axe_active_symbol";
const LS_TF = "axe_active_tf";
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "D", "W"];

type PinnedContextProps = {
  /** Static pinned text from the server — shown next to pin icon. */
  text: string;
};

export function PinnedContext({ text }: PinnedContextProps) {
  const router = useRouter();
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

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-3 py-2">
      {/* ── Left: pair + TF chips (interactive) ──────────────────────── */}

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

      {/* ── Right: red pin + context text → settings ─────────────────── */}
      <button
        type="button"
        onClick={() => router.push("/settings")}
        className="ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors active:bg-white/[0.04]"
      >
        <Pin className="h-3 w-3 shrink-0 text-red-400/80" />
        <span className="truncate text-[10px] text-white/30">
          {text || "Set session brief..."}
        </span>
        <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-white/15" />
      </button>
    </div>
  );
}
