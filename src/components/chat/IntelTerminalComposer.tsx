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
          <AxeAuraWave variant="composer" />
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
          onClick={() => onQuickAction("Give me a full market brief for today.")}
          disabled={disabled || sending}
          className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          Brief All
        </button>
        <span className="h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => onQuickAction("What are the top risks to watch today?")}
          disabled={disabled || sending}
          className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          Top Risks
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
          placeholder="Ask anything..."
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
