import Image from "next/image";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { MarketingStatusBar } from "@/components/marketing/MarketingStatusBar";
import { marketingChat } from "@/services/mock/marketingVisualData";
import { Mic, Paperclip, Send } from "lucide-react";

export function MarketingChatScreen() {
  const c = marketingChat;
  return (
    <div className="flex h-[780px] flex-col bg-tos-bg">
      <MarketingStatusBar />
      <div className="flex flex-1 flex-col px-4 pb-5">
        <header className="flex items-start justify-between gap-2 pt-1">
          <div className="flex min-w-0 items-start gap-2">
            <Image
              src="/axe-logo-companion.png"
              alt=""
              width={28}
              height={28}
              className="mt-0.5 h-7 w-7 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-tos-text">
                Assistant
              </h2>
              <p className="text-[11px] text-tos-muted">Direct channel</p>
            </div>
          </div>
          <Badge variant="warm">Secure</Badge>
        </header>

        <GlassPanel glow="warm" className="mt-3 px-3 py-2.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-tos-warm">
            Pinned context
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-tos-muted">{c.pinned}</p>
        </GlassPanel>

        <div className="tos-scrollbar mt-4 flex flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
          {c.messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "border border-tos-warm/20 bg-tos-warm-soft/35 text-tos-text"
                    : "border border-tos-border bg-white/[0.04] text-tos-text"
                }`}
              >
                {m.body}
              </div>
              <span className="mt-1 px-1 font-mono text-[9px] text-tos-dim">{m.time}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 shrink-0 border-t border-tos-border pt-3">
          <div className="flex items-end gap-2 rounded-2xl border border-tos-border bg-tos-elevated/80 p-2">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-tos-dim"
              aria-label="Attach"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-tos-dim"
              aria-label="Voice"
            >
              <Mic className="h-4 w-4" />
            </button>
            <div className="flex flex-1 items-center py-2 text-[13px] text-tos-dim">
              Message…
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tos-warm/90 text-tos-bg">
              <Send className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
