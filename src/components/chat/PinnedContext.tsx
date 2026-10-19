"use client";

/**
 * PinnedContext — chip-based context strip at the top of the chat view.
 *
 * Reads/writes the shared active-session store (symbol + timeframe) so
 * Home / Markets / Chart / AXE / Account stay in sync.
 */

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pin, ChevronRight } from "lucide-react";
import { CHART_TF_OPTIONS } from "@/lib/broker/chartTimeframes";
import { useActiveSession, usePatchActiveSession } from "@/lib/session/activeSessionStore";

type PinnedContextProps = {
  /** Static pinned text from the server — shown next to pin icon. */
  text: string;
};

export function PinnedContext({ text }: PinnedContextProps) {
  const router = useRouter();
  const session = useActiveSession();
  const patchSession = usePatchActiveSession();
  const symbol = session.symbol;
  const tf = session.timeframe;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function openEdit() {
    setDraft(symbol);
    setEditing(true);
  }

  function commitSymbol() {
    const upper = draft.trim().toUpperCase();
    if (upper) patchSession({ symbol: upper });
    setEditing(false);
  }

  function cycleTf() {
    const idx = CHART_TF_OPTIONS.findIndex((option) => option.key === tf);
    const next = CHART_TF_OPTIONS[(idx + 1) % CHART_TF_OPTIONS.length] ?? CHART_TF_OPTIONS[0];
    if (next) patchSession({ timeframe: next.key });
  }

  const tfLabel = CHART_TF_OPTIONS.find((option) => option.key === tf)?.label ?? tf;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-3 py-2">
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
          className="rounded-lg border border-[rgba(0,212,245,0.15)] bg-[rgba(0,212,245,0.06)] px-2.5 py-1.5 font-mono text-[11px] tracking-wider text-[#00d4f5] transition-colors hover:bg-[rgba(0,212,245,0.1)] active:scale-95"
        >
          {symbol}
        </button>
      )}

      <button
        type="button"
        onClick={cycleTf}
        className="rounded-lg border border-[rgba(0,212,245,0.15)] bg-[rgba(0,212,245,0.06)] px-2.5 py-1.5 font-mono text-[11px] tracking-wider text-[#00d4f5] transition-colors hover:bg-[rgba(0,212,245,0.1)] active:scale-95"
      >
        {tfLabel}
      </button>

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
