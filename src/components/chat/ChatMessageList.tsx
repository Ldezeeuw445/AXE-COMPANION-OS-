"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Bookmark, Check } from "lucide-react";
import type { ChatMessage } from "@/types/domain";
import { ActionCard } from "@/components/chat/ActionCard";
import { TtsButton } from "@/components/chat/TtsButton";
import { formatTimeHm } from "@/lib/formatDate";

type ChatMessageListProps = {
  messages: ChatMessage[];
};

const NEAR_BOTTOM_PX = 96;

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

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
    <div className="relative flex flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="tos-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto pr-1"
      >
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
              <p className="whitespace-pre-wrap">{m.content}</p>
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
        <div ref={bottomRef} />
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Jump to latest message"
          className="pointer-events-auto absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-[#070A10]/85 px-3 py-1.5 text-[10.5px] font-semibold text-cyan-100/95 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur transition-colors hover:bg-cyan-500/15"
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
            : "border-white/[0.06] hover:border-cyan-400/30 hover:text-cyan-200"
      }`}
    >
      {state === "saved" ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
    </button>
  );
}
