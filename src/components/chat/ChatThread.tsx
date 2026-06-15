"use client";

/**
 * Live chat thread — merges server-rendered history with Supabase Realtime
 * inserts so phone + desktop stay in sync without manual refresh.
 */

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import type { ChatMessage } from "@/types/domain";

type ChatThreadProps = {
  conversationId: string;
  initialMessages: ChatMessage[];
  realtimeEnabled: boolean;
};

function mapRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    role: row.role as ChatMessage["role"],
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function ChatThread({
  conversationId,
  initialMessages,
  realtimeEnabled,
}: ChatThreadProps) {
  const [messages, setMessages] = useState(initialMessages);
  const streamingRef = useRef(false);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    function onThinking(e: Event) {
      const ce = e as CustomEvent<{ thinking: boolean }>;
      streamingRef.current = Boolean(ce.detail?.thinking);
    }
    window.addEventListener("axe:thinking", onThinking);
    return () => window.removeEventListener("axe:thinking", onThinking);
  }, []);

  useEffect(() => {
    if (!realtimeEnabled || !conversationId) return;

    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`chat-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const next = mapRow(row);
          setMessages((prev) => {
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
          if (!streamingRef.current || next.role === "user") {
            window.dispatchEvent(new CustomEvent("axe:chat-pin"));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, realtimeEnabled]);

  return <ChatMessageList messages={messages} />;
}
