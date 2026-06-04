"use client";

/**
 * PinnedContext — read-only chip strip at the top of the chat view.
 *
 * Layout: pin icon → "CONTEXT" → XAUUSD chip → H1 chip → chevron
 *
 * Tapping anywhere navigates to /settings where the user can edit
 * their session brief, watchlist, and active pair/TF.
 *
 * Reads from localStorage:
 *   axe_active_symbol, axe_active_tf
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pin, ChevronRight } from "lucide-react";

const LS_SYMBOL = "axe_active_symbol";
const LS_TF = "axe_active_tf";

type PinnedContextProps = {
  /** Static pinned text from the server (legacy) — shown as a dim label when set. */
  text: string;
};

export function PinnedContext({ text }: PinnedContextProps) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [tf, setTf] = useState("");

  // Hydrate from localStorage (SSR-safe)
  useEffect(() => {
    setSymbol(localStorage.getItem(LS_SYMBOL) ?? "");
    setTf(localStorage.getItem(LS_TF) ?? "");
  }, []);

  const hasContext = Boolean(symbol || tf);

  return (
    <button
      type="button"
      onClick={() => router.push("/settings")}
      className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.015] px-3 py-2 transition-colors active:bg-white/[0.04]"
    >
      {/* Pin icon + label */}
      <Pin className="h-3 w-3 shrink-0 text-white/30" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">
        Context
      </span>

      {/* Pair chip (display-only) */}
      <span
        className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] tracking-wider ${
          symbol
            ? "border-[rgba(0,212,245,0.15)] bg-[rgba(0,212,245,0.06)] text-[#00d4f5]"
            : "border-white/[0.06] bg-white/[0.03] text-white/25"
        }`}
      >
        {symbol || "+ pair"}
      </span>

      {/* TF chip (display-only) */}
      <span
        className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] tracking-wider ${
          tf
            ? "border-[rgba(0,212,245,0.15)] bg-[rgba(0,212,245,0.06)] text-[#00d4f5]"
            : "border-white/[0.06] bg-white/[0.03] text-white/25"
        }`}
      >
        {tf || "tf"}
      </span>

      {/* Legacy pinned text */}
      {text && !hasContext ? (
        <span className="truncate text-[10px] text-white/20">{text}</span>
      ) : null}

      {/* Spacer + chevron */}
      <div className="flex-1" />
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/20" />
    </button>
  );
}
