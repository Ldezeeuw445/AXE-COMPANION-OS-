"use client";

/**
 * IntelAiChat — Floating AXE INTELLIGENT AGENT chat panel for the Intel tab.
 *
 * FAB: Square button with cyan triangle (AXE logo) — toggles chat open/closed.
 * Panel: Full-height overlay with "AXE INTELLIGENT AGENT" header, scrolling message area,
 *        and "Query intelligence..." input with cyan send button.
 *
 * Streams responses from /api/intel-chat using SSE for real-time token display.
 * Maintains local message history (not persisted to Supabase conversations).
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { X, Send, Save } from "lucide-react";
import { AxeTriangle } from "@/components/brand/AxeTriangle";

/* ── Types ─────────────────────────────────────────────────────────── */

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

/* ── Constants ─────────────────────────────────────────────────────── */

const INITIAL_MESSAGE: Message = {
  id: "system-0",
  role: "system",
  content:
    "Ask me about correlations in the current intel feeds...",
};

/* ── Typing indicator ──────────────────────────────────────────────── */

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-[5px] w-[5px] rounded-full bg-[#00d4f5]"
          style={{
            animation: "intel-dot-pulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes intel-dot-pulse {
          0%,
          80%,
          100% {
            opacity: 0.25;
            transform: scale(0.85);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </span>
  );
}

/* ── Main Component ────────────────────────────────────────────────── */

export function IntelAiChat({ symbol }: { symbol?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setStreaming(true);

      // Build history for context (skip system messages)
      const history = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch("/api/intel-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history,
            symbol: symbol ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `⚠️ ${err.error ?? "Request failed"}` }
                : m
            )
          );
          setStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") break;

            try {
              const parsed = JSON.parse(payload);
              if (parsed.text) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + parsed.text }
                      : m
                  )
                );
              }
              if (parsed.error) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + `\n⚠️ ${parsed.error}` }
                      : m
                  )
                );
              }
            } catch {
              /* skip malformed chunks */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      m.content ||
                      `⚠️ ${err instanceof Error ? err.message : "Connection lost"}`,
                  }
                : m
            )
          );
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [messages, streaming, symbol]
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  return (
    <>
      {/* ── FAB: Cyan triangle button ─────────────────────────── */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+90px)] right-4 z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-white/[0.12] bg-[#0a0a0d]/95 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md active:scale-95"
        style={{ transition: "transform 0.12s ease" }}
        aria-label={open ? "Close AXE Agent" : "Open AXE Agent"}
      >
        {open ? (
          <X className="h-5 w-5 text-white/70" />
        ) : (
          <AxeTriangle size={28} />
        )}
      </button>

      {/* ── Chat Panel ────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[55] flex flex-col"
          style={{
            top: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            className="relative mt-auto flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.08] bg-[#060608]"
            style={{
              animation: "intel-panel-up 0.25s ease-out",
            }}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-bold tracking-tight text-white">
                  AXE INTELLIGENT AGENT
                </h2>
                <span className="h-2 w-2 rounded-full bg-[#00d4f5] shadow-[0_0_6px_rgba(0,212,245,0.6)]" />
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
              style={{ minHeight: "200px" }}
            >
              <div className="flex flex-col gap-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {streaming &&
                  messages[messages.length - 1]?.role === "assistant" &&
                  messages[messages.length - 1]?.content === "" && (
                    <div className="flex items-center gap-2 px-1 py-1">
                      <TypingDots />
                      <span className="text-[10px] text-white/30">
                        Analyzing feeds...
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex shrink-0 items-end gap-3 border-t border-white/[0.06] px-4 py-3"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Query intelligence..."
                rows={1}
                disabled={streaming}
                className="min-h-[44px] max-h-[120px] flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 font-mono text-[13px] text-white/90 placeholder:text-white/25 focus:border-[#00d4f5]/30 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || streaming}
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#00d4f5] text-[#060608] shadow-[0_2px_12px_rgba(0,212,245,0.25)] transition-opacity disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>

          <style jsx>{`
            @keyframes intel-panel-up {
              from {
                transform: translateY(100%);
                opacity: 0.5;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

/* ── Message Bubble ──────────────────────────────────────────────── */

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <p className="font-mono text-[13px] leading-relaxed text-white/50">
          {message.content}
        </p>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#00d4f5]/10 border border-[#00d4f5]/15 px-4 py-2.5">
          <p className="text-[13px] leading-relaxed text-white/90">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%]">
        <div className="mb-1 flex items-center gap-1.5 px-0.5">
          <span className="h-1 w-1 rounded-full bg-[#00d4f5]/70" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
            AXE AGENT
          </span>
        </div>
        <div className="rounded-2xl rounded-tl-md bg-white/[0.03] border border-white/[0.06] px-4 py-3">
          <AssistantContent content={message.content} />
          {message.content.length > 20 && (
            <SaveToVaultButton content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Markdown-lite renderer for assistant messages ────────────────── */

function AssistantContent({ content }: { content: string }) {
  if (!content) return null;

  // Split by lines and render with basic formatting
  const lines = content.split("\n");

  return (
    <div className="space-y-1 text-[13px] leading-[1.65] text-white/85">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();

        // Headers (## or **HEADER**)
        if (trimmed.startsWith("## ")) {
          return (
            <p key={i} className="mt-2 text-[11px] font-bold uppercase tracking-widest text-[#00d4f5]/80">
              {trimmed.slice(3)}
            </p>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <p key={i} className="mt-1.5 text-[12px] font-semibold text-white/70">
              {trimmed.slice(4)}
            </p>
          );
        }

        // Bullet points
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          return (
            <p key={i} className="pl-3 text-[12.5px]">
              <span className="text-[#00d4f5]/50">•</span>{" "}
              <InlineFormat text={trimmed.slice(2)} />
            </p>
          );
        }

        // Bold block headers like **SIGNAL** or **NO SIGNAL**
        if (
          trimmed.startsWith("**SIGNAL") ||
          trimmed.startsWith("**NO SIGNAL") ||
          trimmed.startsWith("**VERDICT")
        ) {
          return (
            <p key={i} className="mt-2 text-[12px] font-bold text-[#00d4f5]">
              <InlineFormat text={trimmed} />
            </p>
          );
        }

        // Empty lines
        if (!trimmed) return <div key={i} className="h-1" />;

        // Regular text
        return (
          <p key={i}>
            <InlineFormat text={trimmed} />
          </p>
        );
      })}
    </div>
  );
}

/* ── Save to Vault button for assistant messages ─────────────────── */

function SaveToVaultButton({ content }: { content: string }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);

    try {
      const res = await fetch("/api/vault/save-axe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          title: "AXE Intel Analysis",
        }),
      });
      if (res.ok) setSaved(true);
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  }, [content, saving, saved]);

  return (
    <button
      onClick={handleSave}
      disabled={saving || saved}
      className={`mt-2 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all ${
        saved
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
          : "border-white/[0.08] bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60"
      }`}
    >
      <Save className="h-3 w-3" />
      {saved ? "Saved to Vault" : saving ? "Saving..." : "Save to Vault"}
    </button>
  );
}

/** Inline bold/code formatting */
function InlineFormat({ text }: { text: string }) {
  // Process **bold** and `code` inline
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-[#00d4f5]/80"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
