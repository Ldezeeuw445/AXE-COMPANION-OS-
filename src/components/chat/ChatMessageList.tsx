import type { ChatMessage } from "@/types/domain";
import { ActionCard } from "@/components/chat/ActionCard";
import { TtsButton } from "@/components/chat/TtsButton";
import { formatTimeHm } from "@/lib/formatDate";

type ChatMessageListProps = {
  messages: ChatMessage[];
};

export function ChatMessageList({ messages }: ChatMessageListProps) {
  return (
    <div className="tos-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto pr-1">
      {messages.map((m) => (
        <article
          key={m.id}
          className={`group flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
        >
          {/* Label */}
          <div className={`mb-1.5 flex items-center gap-1.5 px-1.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span
              className={`h-1 w-1 rounded-full ${
                m.role === "user" ? "bg-tos-gold/70" : "bg-tos-warm/70"
              }`}
            />
            <p
              className={`text-[10px] font-semibold uppercase tracking-widest ${
                m.role === "user"
                  ? "text-tos-gold/80"
                  : "text-tos-warm/80"
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

          {/* Time + TTS */}
          <div className={`flex items-center gap-1.5 px-1.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <time className="text-[10px] text-tos-dim" dateTime={m.createdAt}>
              {formatTimeHm(m.createdAt)}
            </time>
            {m.role === "assistant" ? <TtsButton text={m.content} /> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
