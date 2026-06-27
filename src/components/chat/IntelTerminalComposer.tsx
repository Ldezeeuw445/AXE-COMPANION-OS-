"use client";

import { Send } from "lucide-react";
import { AxeAuraWave } from "@/components/ui/AxeAuraWave";

type IntelTerminalComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onQuickAction: (draft: string) => void;
  disabled?: boolean;
  sending?: boolean;
  inputId?: string;
  showAura?: boolean;
  onFocus?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export function IntelTerminalComposer({
  value,
  onChange,
  onSubmit,
  onQuickAction,
  disabled = false,
  sending = false,
  inputId = "intel-composer-input",
  showAura = true,
  onFocus,
  textareaRef,
}: IntelTerminalComposerProps) {
  return (
    <div className="relative overflow-visible">
      {showAura ? (
        <div
          className="pointer-events-none absolute left-1/2 bottom-full z-0 flex -translate-x-1/2 translate-y-[54%] justify-center xl:hidden"
          aria-hidden
        >
          <AxeAuraWave variant="composer" palette="intel" />
        </div>
      ) : null}
      <div
        className="relative z-10 flex items-center gap-1 overflow-hidden rounded-full border border-white/[0.08] px-1.5 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        style={{
          background: "linear-gradient(180deg, #121216 0%, #0a0a0c 100%)",
          touchAction: "pan-y",
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onQuickAction("How do energy flows correlate with XAUUSD right now? Signal, confidence and feeds.")}
          disabled={disabled || sending}
          className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#00d4f5]/90 transition-colors hover:bg-[#00d4f5]/10 hover:text-[#00d4f5] disabled:opacity-40"
        >
          Energy vs Gold
        </button>
        <span className="h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => onQuickAction("What's the market tide signal across my watchlist? Net premium and bias.")}
          disabled={disabled || sending}
          className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#00d4f5]/90 transition-colors hover:bg-[#00d4f5]/10 hover:text-[#00d4f5] disabled:opacity-40"
        >
          Market Tide
        </button>
        <span className="h-4 w-px bg-white/10" />
        <label className="sr-only" htmlFor={inputId}>
          Message
        </label>
        <textarea
          ref={textareaRef}
          id={inputId}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask intel…"
          disabled={disabled || sending}
          className="max-h-20 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-white/90 shadow-none placeholder:text-white/25 focus:outline-none focus:ring-0 disabled:opacity-50"
        />
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
          style={{
            background: "#00d4f5",
            boxShadow: "0 0 10px rgba(0,212,245,0.3), 0 2px 8px rgba(0,0,0,0.3)",
          }}
          disabled={!value.trim() || disabled || sending}
          aria-label="Send"
          onClick={onSubmit}
        >
          <Send className="h-4 w-4 text-black" />
        </button>
      </div>
    </div>
  );
}
