"use client";

/**
 * IntelAiChat — Floating AXE INTELLIGENT AGENT chat panel for the Intel tab.
 * Uses the same terminal composer and /api/chat/stream pipeline as /chat?intel=1.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { X } from "lucide-react";
import { AxeTriangle } from "@/components/brand/AxeTriangle";
import { IntelTerminalComposer } from "@/components/chat/IntelTerminalComposer";
import { ChatMessageActions } from "@/components/chat/ChatMessageActions";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/types/domain";

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

export function IntelAiChat({ symbol }: { symbol?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadThread = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/thread?type=intel", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ChatMessage[] };
      if (Array.isArray(data.messages)) {
        setMessages(data.messages.filter((m) => m.role !== "system"));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) void loadThread();
  }, [open, loadThread]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, streamText]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setInput("");
      setStreaming(true);
      setStreamText("");

      const optimisticUser: ChatMessage = {
        id: `opt-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        let authHeader: Record<string, string> = {};
        try {
          const sb = createClient();
          const {
            data: { session },
          } = await sb.auth.getSession();
          if (session?.access_token) {
            authHeader = { Authorization: `Bearer ${session.access_token}` };
          }
        } catch {
          /* cookie fallback */
        }

        const body: Record<string, unknown> = {
          text: trimmed,
          type: "intel",
        };
        if (symbol) body.symbol = symbol;

        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error("Stream failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let currentEvent = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const data = JSON.parse(payload);
                if (currentEvent === "token" && data.text) {
                  accumulated += data.text;
                  setStreamText(accumulated);
                } else if (currentEvent === "error") {
                  throw new Error(data.message ?? "AXE error");
                } else if (currentEvent === "done") {
                  await loadThread();
                }
              } catch (e) {
                if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                  throw e;
                }
              }
            }
          }
        }

        await loadThread();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content: `⚠️ ${err instanceof Error ? err.message : "Connection lost"}`,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStreamText("");
      }
    },
    [streaming, symbol, loadThread],
  );

  const runQuickAction = useCallback(
    (draft: string) => {
      setInput(draft);
      void sendMessage(draft);
    },
    [sendMessage],
  );

  const visibleMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");

  return (
    <>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-white/[0.12] bg-[#0a0a0d]/95 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md active:scale-95"
          style={{ transition: "transform 0.12s ease", bottom: "calc(var(--tos-nav-offset) + 0.6rem)" }}
          aria-label="Open AXE Agent"
        >
          <AxeTriangle size={28} />
        </button>
      ) : null}

      {open && (
        <div
          className="fixed inset-x-0 z-[55] flex flex-col"
          style={{
            top: "env(safe-area-inset-top, 0px)",
            bottom: "var(--tos-nav-offset)",
          }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div
            className="relative mt-auto flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.08] bg-[#060608]"
            style={{ animation: "intel-panel-up 0.25s ease-out" }}
          >
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

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain px-5 py-4"
              style={{ minHeight: "200px" }}
            >
              <div className="flex flex-col gap-4">
                {visibleMessages.length === 0 && !streaming ? (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <p className="font-mono text-[13px] leading-relaxed text-white/50">
                      Ask about correlations, smart money, alt-data, or macro context across live intel feeds.
                    </p>
                  </div>
                ) : null}

                {visibleMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {streaming && streamText ? (
                  <MessageBubble
                    message={{
                      id: "streaming",
                      role: "assistant",
                      content: streamText,
                      createdAt: new Date().toISOString(),
                    }}
                  />
                ) : null}

                {streaming && !streamText ? (
                  <div className="flex items-center gap-2 px-1 py-1">
                    <TypingDots />
                    <span className="text-[10px] text-white/30">Analyzing feeds...</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-white/[0.06] px-3 py-3">
              <IntelTerminalComposer
                value={input}
                onChange={setInput}
                onSubmit={() => void sendMessage(input)}
                onQuickAction={runQuickAction}
                disabled={streaming}
                sending={streaming}
                inputId="intel-panel-composer"
                showAura={false}
                textareaRef={inputRef}
              />
            </div>
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[#00d4f5]/15 bg-[#00d4f5]/10 px-4 py-2.5">
          <p className="text-[13px] leading-relaxed text-white/90">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%]">
        <div className="mb-1 flex items-center gap-1.5 px-0.5">
          <span className="h-1 w-1 rounded-full bg-[#00d4f5]/70" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
            AXE AGENT
          </span>
        </div>
        <div className="rounded-2xl rounded-tl-md border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-white/85">
            {message.content}
          </p>
          {message.id !== "streaming" && message.content.length > 20 ? (
            <ChatMessageActions
              messageId={message.id}
              content={message.content}
              initialFeedback={message.feedback ?? null}
              vaultTitle="AXE Intel Analysis"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
