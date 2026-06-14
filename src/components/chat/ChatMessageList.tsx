"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight, Bookmark, Check } from "lucide-react";
import type { ChatMessage } from "@/types/domain";
import { ActionCard } from "@/components/chat/ActionCard";
import { TtsButton } from "@/components/chat/TtsButton";
import { formatTimeHm } from "@/lib/formatDate";
import { MarkdownLite, renderMarkdownInline } from "@/components/ui/MarkdownLite";

/**
 * Suggested first prompts shown when the thread is empty. Each runs through
 * the same /chat?q=… route the workflows hub uses, so they reach the
 * composer pre-filled and trigger AXE's full tool stack on submit. Picked
 * to showcase three different muscles: live price, journal review,
 * macro-aware setup brief.
 */
const STARTER_PROMPTS: Array<{ q: string; label: string; hint: string }> = [
  {
    q: "What is XAUUSD doing right now? Bias, key levels and what would change my view.",
    label: "Brief me on XAUUSD",
    hint: "live price + day range + bias",
  },
  {
    q: "Walk me through this week's economic calendar and how it lands on USD pairs.",
    label: "This week's macro risk",
    hint: "calendar + pair impact",
  },
  {
    q: "Review my last 5 trades and tell me the one mistake I keep making.",
    label: "Coach my last week",
    hint: "journal + pattern",
  },
];

function TypingBubble() {
  return (
    <article className="group flex flex-col items-start">
      <div className="mb-1.5 flex items-center gap-1.5 px-1.5">
        <span className="h-1 w-1 rounded-full bg-[#00d4f5]/70" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">AXE</p>
      </div>
      <div className="flex items-center gap-[5px] px-3 py-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="inline-block h-[6px] w-[6px] rounded-full bg-[#00d4f5]"
            style={{
              animation: "axe-dot-breathe 1.6s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </article>
  );
}

/**
 * StreamingBubble — typewriter-style character reveal.
 *
 * Tokens arrive in variable-sized chunks from SSE. Instead of dumping each
 * chunk visually, we maintain a "revealed" cursor that advances at a steady
 * pace (CHAR_INTERVAL ms per character). When new tokens push `text` ahead
 * of the cursor, the reveal loop catches up smoothly. When idle (cursor
 * caught up), no timer runs.
 */
const CHAR_INTERVAL = 12; // ms between revealed characters

function StreamingBubble({ text, phase }: { text: string; phase: string | null }) {
  const showToolHint = phase === "tools" && !text;
  const [revealed, setRevealed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;

  // Reset reveal cursor when a new stream starts (text goes to "")
  useEffect(() => {
    if (text === "") setRevealed(0);
  }, [text]);

  // Advance reveal cursor with requestAnimationFrame for smoothness
  useEffect(() => {
    function step(now: number) {
      if (now - lastFrameRef.current >= CHAR_INTERVAL) {
        lastFrameRef.current = now;
        setRevealed((prev) => {
          const target = textRef.current.length;
          if (prev >= target) return prev;
          // Advance 1-3 chars per frame to keep up without stutter
          const remaining = target - prev;
          const advance = remaining > 40 ? 3 : remaining > 20 ? 2 : 1;
          return Math.min(prev + advance, target);
        });
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const visibleText = text.slice(0, revealed);

  return (
    <article className="group flex flex-col items-start">
      <div className="mb-1.5 flex items-center gap-1.5 px-1.5">
        <span className="h-1 w-1 rounded-full bg-[#00d4f5]/70" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">AXE</p>
      </div>
      {showToolHint ? (
        <div className="flex items-center gap-[5px] px-3 py-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="inline-block h-[6px] w-[6px] rounded-full bg-[#00d4f5]"
              style={{
                animation: "axe-dot-breathe 1.6s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
          <span className="ml-2 text-[10px] text-white/30">fetching data…</span>
        </div>
      ) : (
        <div className="max-w-[85%] px-1">
          {renderAssistantBody(visibleText)}
          <span className="inline-block h-4 w-[2px] animate-pulse bg-[#00d4f5]/70 align-text-bottom" />
        </div>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-1 py-6 text-tos-muted">
      <div>
        <p className="text-base font-semibold text-tos-text">Welcome.</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-tos-muted">
          I&apos;m AXE — your trading advisor. I read your chart, positions, journal and the macro calendar
          to give you sharp setups and honest reviews. Pick a starter or just type below.
        </p>
      </div>
      <ul className="w-full space-y-2">
        {STARTER_PROMPTS.map((p) => (
          <li key={p.label}>
            <Link
              href={`/chat?q=${encodeURIComponent(p.q)}`}
              className="group flex w-full items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-left text-[12.5px] text-tos-text hover:border-white/[0.12] hover:bg-white/[0.05]"
            >
              <span className="flex flex-col">
                <span className="font-medium">{p.label}</span>
                <span className="text-[10.5px] text-tos-dim">{p.hint}</span>
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-white/40 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Renders an AXE message body with inline navigation buttons.
 *
 * AXE's `navigate_to` tool emits `[[link:/path|Label]]` markers in its replies.
 * Everything outside the markers stays as plain pre-wrapped text; markers
 * become tappable cyan buttons that route inside the app via next/link.
 */
function renderAssistantBody(content: string): ReactNode {
  return <MarkdownLite content={content} />;
}

function renderUserBody(content: string): ReactNode {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((line) => /^([-*•]|\d+\.)\s+/.test(line) || /^\[[^\]]+\]$/.test(line))) {
    return (
      <div className="space-y-1.5 text-sm leading-relaxed">
        {lines.map((line, i) => {
          const cleaned = line.replace(/^([-*•]|\d+\.)\s+/, "");
          return (
            <p key={i} className="text-tos-text">
              {renderMarkdownInline(cleaned)}
            </p>
          );
        })}
      </div>
    );
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{renderMarkdownInline(normalized)}</p>;
}

type ChatMessageListProps = {
  messages: ChatMessage[];
};

type OptimisticUserMessage = {
  id: string;
  content: string;
  createdAt: string;
  hasImage: boolean;
};

const NEAR_BOTTOM_PX = 96;

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [pending, setPending] = useState<OptimisticUserMessage[]>([]);
  const [streamText, setStreamText] = useState("");
  const [streamPhase, setStreamPhase] = useState<string | null>(null);
  const lastServerCountRef = useRef(messages.length);

  // Composer dispatches events for optimistic bubbles, thinking state,
  // and streaming tokens from the SSE response.
  useEffect(() => {
    function onThinking(e: Event) {
      const ce = e as CustomEvent<{ thinking: boolean }>;
      const on = Boolean(ce.detail?.thinking);
      setThinking(on);
      if (on) {
        // Starting a new message — reset stream state
        setStreamText("");
        setStreamPhase("thinking");
      } else {
        // Done — clear stream phase (router.refresh will bring persisted msg)
        setStreamPhase(null);
        setStreamText("");
      }
    }
    function onUserMessage(e: Event) {
      const ce = e as CustomEvent<OptimisticUserMessage>;
      if (!ce.detail?.content) return;
      setPending((prev) => [...prev, ce.detail]);
    }
    function onStreamToken(e: Event) {
      const ce = e as CustomEvent<{ text: string }>;
      if (ce.detail?.text) {
        setStreamText((prev) => prev + ce.detail.text);
      }
    }
    function onStreamStatus(e: Event) {
      const ce = e as CustomEvent<{ phase: string; tools?: string[] }>;
      const phase = ce.detail?.phase ?? null;
      setStreamPhase(phase);
      // When switching to tools or starting a new response, clear partial text
      if (phase === "tools" || phase === "responding") {
        setStreamText("");
      }
    }
    window.addEventListener("axe:thinking", onThinking);
    window.addEventListener("axe:user-message", onUserMessage);
    window.addEventListener("axe:stream-token", onStreamToken);
    window.addEventListener("axe:stream-status", onStreamStatus);
    return () => {
      window.removeEventListener("axe:thinking", onThinking);
      window.removeEventListener("axe:user-message", onUserMessage);
      window.removeEventListener("axe:stream-token", onStreamToken);
      window.removeEventListener("axe:stream-status", onStreamStatus);
    };
  }, []);

  // When the server-side messages array grows, the optimistic bubble is now
  // duplicated by the real persisted message — clear pending. Also clears
  // safely on server errors that still cause a router.refresh().
  useEffect(() => {
    if (messages.length > lastServerCountRef.current) {
      setPending([]);
    }
    lastServerCountRef.current = messages.length;
  }, [messages.length]);

  // Safety net: if the server hangs (>20s), drop the optimistic bubble so
  // we don't have a phantom message sitting forever.
  useEffect(() => {
    if (pending.length === 0) return;
    const t = setTimeout(() => setPending([]), 20_000);
    return () => clearTimeout(t);
  }, [pending.length]);

  // Scroll to bottom on first mount and whenever messages change while user
  // is still parked near the bottom. Honour reading older messages otherwise.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (!stickToBottomRef.current) {
      queueMicrotask(() => setShowJump(true));
      return;
    }
    queueMicrotask(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
  }, [messages.length]);

  // Mount: snap to bottom and prime the stickiness flag.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    queueMicrotask(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
      stickToBottomRef.current = true;
      setShowJump(false);
    });
  }, []);

  // Auto-scroll to the typing/streaming bubble when AXE starts thinking,
  // tokens stream in, or an optimistic user bubble is added.
  useEffect(() => {
    if ((thinking || pending.length > 0 || streamText) && stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [thinking, pending.length, streamText]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    setShowJump(!nearBottom && messages.length > 0);
  }

  function jumpToLatest() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    stickToBottomRef.current = true;
    setShowJump(false);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="tos-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-[7rem] pr-1 md:pb-2"
      >
        {messages.length === 0 && pending.length === 0 ? <EmptyState /> : null}
        {messages.map((m) => (
          <article
            key={m.id}
            className={`group flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            {/* Label */}
            <div
              className={`mb-1.5 flex items-center gap-1.5 px-1.5 ${
                m.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <span
                className={`h-1 w-1 rounded-full ${
                  m.role === "user" ? "bg-tos-gold/70" : "bg-tos-warm/70"
                }`}
              />
              <p
                className={`text-[10px] font-semibold uppercase tracking-widest ${
                  m.role === "user" ? "text-tos-gold/80" : "text-tos-warm/80"
                }`}
              >
                {m.role === "user" ? "You said" : "AXE"}
              </p>
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[92%] rounded-[1.15rem] px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "tos-bubble-user text-tos-text"
                  : "tos-bubble-assistant text-tos-text"
              }`}
            >
              {m.role === "assistant" ? renderAssistantBody(m.content) : renderUserBody(m.content)}
              {m.actionCard ? <ActionCard card={m.actionCard} /> : null}
            </div>

            {/* Time + actions */}
            <div
              className={`flex items-center gap-1.5 px-1.5 ${
                m.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <time className="text-[10px] text-tos-dim" dateTime={m.createdAt}>
                {formatTimeHm(m.createdAt)}
              </time>
              {m.role === "assistant" ? (
                <>
                  <TtsButton text={m.content} />
                  <SaveToVaultButton message={m} />
                </>
              ) : null}
            </div>
          </article>
        ))}
        {pending.map((p) => (
          <article key={p.id} className="group flex flex-col items-end">
            <div className="mb-1.5 flex flex-row-reverse items-center gap-1.5 px-1.5">
              <span className="h-1 w-1 rounded-full bg-tos-gold/70" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-tos-gold/80">You said</p>
            </div>
            <div className="tos-bubble-user text-tos-text max-w-[92%] rounded-[1.15rem] px-3.5 py-2.5 text-sm leading-relaxed opacity-90">
              <div>
                {p.hasImage && p.content === "(chart attached)" ? (
                  <span className="italic text-tos-muted">Chart attached…</span>
                ) : (
                  renderUserBody(p.content)
                )}
              </div>
            </div>
            <div className="flex flex-row-reverse items-center gap-1.5 px-1.5">
              <time className="text-[10px] text-tos-dim" dateTime={p.createdAt}>
                {formatTimeHm(p.createdAt)}
              </time>
              <span className="text-[9.5px] uppercase tracking-wider text-tos-dim/80" aria-label="sending">
                · sending
              </span>
            </div>
          </article>
        ))}
        {/* Streaming / thinking indicator */}
        {thinking && streamText ? (
          <StreamingBubble text={streamText} phase={streamPhase} />
        ) : thinking ? (
          <TypingBubble />
        ) : null}
        <div ref={bottomRef} />
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Jump to latest message"
          className="pointer-events-auto absolute bottom-[6.8rem] right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-[#060608]/90 px-3 py-1.5 text-[10.5px] font-semibold text-white/85 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur transition-colors hover:bg-white/[0.08] md:bottom-3"
        >
          <ArrowDown className="h-3 w-3" />
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}

function SaveToVaultButton({ message }: { message: ChatMessage }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    try {
      const res = await fetch("/api/vault/save-axe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: message.content,
          messageId: message.id,
          symbol: null,
        }),
      });
      if (res.ok) {
        setState("saved");
        setTimeout(() => setState("idle"), 1800);
      } else {
        setState("error");
        setTimeout(() => setState("idle"), 2200);
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2200);
    }
  }

  const label =
    state === "saved" ? "Saved" : state === "saving" ? "Saving" : state === "error" ? "Retry" : "Save";

  return (
    <button
      type="button"
      onClick={() => void save()}
      aria-label={`${label} this AXE reply to Vault`}
      title={`${label} to Vault`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-tos-dim transition-colors ${
        state === "saved"
          ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200/95"
          : state === "error"
            ? "border-rose-400/35 bg-rose-400/10 text-rose-200/95"
            : "border-white/[0.06] hover:border-white/[0.15] hover:text-white/80"
      }`}
    >
      {state === "saved" ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
    </button>
  );
}
