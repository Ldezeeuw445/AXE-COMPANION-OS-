"use client";

import { Send } from "lucide-react";
import { BorderBeam } from "border-beam";
import { AxeOrb } from "@/components/chat/AxeThinkingOrb";

/** Intel's two standing questions — the reason its composer differs at all. */
const INTEL_QUICK_ACTIONS = [
  {
    label: "Energy vs Gold",
    prompt:
      "How do energy flows correlate with XAUUSD right now? Signal, confidence and feeds.",
  },
  {
    label: "Market Tide",
    prompt: "What's the market tide signal across my watchlist? Net premium and bias.",
  },
] as const;

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
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 justify-center"
          aria-hidden
        >
          <AxeOrb state={sending ? "connecting" : "breathing"} size={64} accent="intel" />
        </div>
      ) : null}
      <BorderBeam size="pulse-outside" colorVariant="mono" borderRadius={26}>
        <div
          className="relative z-10 flex flex-col gap-1 overflow-hidden rounded-[26px] border border-white/[0.07] px-4 pb-2 pt-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{
            background: "linear-gradient(180deg, #131317 0%, #0b0b0e 100%)",
            touchAction: "pan-y",
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <label className="sr-only" htmlFor={inputId}>
            Message
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            enterKeyHint="send"
            onFocus={onFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Ask intel…"
            disabled={disabled || sending}
            className="max-h-40 min-h-[34px] w-full resize-none border-0 bg-transparent px-1 py-1 text-[15px] text-white/90 placeholder:text-white/30 focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center gap-1.5">
            <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {INTEL_QUICK_ACTIONS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => onQuickAction(q.prompt)}
                  disabled={disabled || sending}
                  className="shrink-0 rounded-full border border-[#d4af37]/25 bg-[#d4af37]/[0.07] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#d4af37]/90 transition-colors hover:bg-[#d4af37]/15 disabled:opacity-40"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
              style={{
                background: "linear-gradient(135deg, #C9F24B 0%, #3FE6CF 52%, #7A57FF 100%)",
                boxShadow: "0 0 12px rgba(63,230,207,0.25), 0 2px 8px rgba(0,0,0,0.3)",
              }}
              disabled={!value.trim() || disabled || sending}
              aria-label="Send"
              onClick={onSubmit}
            >
              <Send className="h-4 w-4 text-black" />
            </button>
          </div>
        </div>
      </BorderBeam>
    </div>
  );
}
