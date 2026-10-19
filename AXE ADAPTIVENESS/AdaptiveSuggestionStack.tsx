"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { AdaptiveSuggestionState } from "@/types/adaptive";

type Props = {
  suggestions: AdaptiveSuggestionState[];
  title?: string;
  className?: string;
  onAccept: (suggestion: AdaptiveSuggestionState) => Promise<void> | void;
  onDismiss: (suggestion: AdaptiveSuggestionState) => Promise<void> | void;
};

export function AdaptiveSuggestionStack({
  suggestions,
  title = "AXE noticed something",
  className = "",
  onAccept,
  onDismiss,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const visibleSuggestions = useMemo(() => suggestions.slice(0, 2), [suggestions]);

  if (visibleSuggestions.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-cyan-300/90" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300/85">
          {title}
        </p>
      </div>

      {visibleSuggestions.map((suggestion) => {
        const suggestionTitle =
          typeof suggestion.payload.title === "string" ? suggestion.payload.title : "Use this as your default?";
        const suggestionDescription =
          typeof suggestion.payload.description === "string" ? suggestion.payload.description : "";
        const busy = busyId === suggestion.id;

        return (
          <GlassPanel
            key={suggestion.id}
            className="border border-cyan-400/15 bg-[rgba(6,10,16,0.84)] px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/92">{suggestionTitle}</p>
                {suggestionDescription ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-white/60">{suggestionDescription}</p>
                ) : null}
              </div>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                AXE
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    setBusyId(suggestion.id);
                    await onAccept(suggestion);
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/22 bg-cyan-400/12 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-400/16 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" />
                Use this
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    setBusyId(suggestion.id);
                    await onDismiss(suggestion);
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.06] disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" />
                Not now
              </button>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
