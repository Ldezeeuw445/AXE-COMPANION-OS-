"use client";

import {
  Bell,
  BookOpen,
  LineChart,
  MessageSquare,
  Pin,
  Plus,
  Sparkles,
  Volume2,
} from "lucide-react";
import { AxeContextToolbar, type AxeToolbarSection } from "@/components/axe/AxeContextToolbar";

type Props = {
  conversationTitle?: string | null;
};

function chatQ(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

/**
 * AXE context button for the Chat page. Opens the same premium sheet used
 * across the app, with chat-specific shortcuts.
 */
export function ChatAxeContextButton({ conversationTitle }: Props) {
  const sections: AxeToolbarSection[] = [
    {
      id: "ask",
      title: "Ask AXE",
      items: [
        {
          id: "fresh",
          label: "Start a fresh question",
          description: "Pre-filled prompt — finish it yourself",
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          href: chatQ(""),
        },
        {
          id: "macro-brief",
          label: "Quick macro brief",
          description: "What matters today for my watchlist",
          icon: <Sparkles className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · macro]\nGive me a quick macro brief: what matters today for my watchlist and active pair, in 5 lines.",
          ),
        },
        {
          id: "risk-now",
          label: "Risk check open positions",
          description: "RR, distance to SL/TP, what needs attention",
          icon: <Pin className="h-3.5 w-3.5" />,
          href: chatQ(
            "[AXE · risk]\nRisk-check my open MT5 positions — distance to SL/TP, RR and what needs attention.",
          ),
        },
      ],
    },
    {
      id: "context",
      title: "Context",
      items: [
        {
          id: "open-chart",
          label: "Open chart for active symbol",
          description: "Jump to chart in one tap",
          icon: <LineChart className="h-3.5 w-3.5" />,
          href: "/chart",
        },
        {
          id: "open-alerts",
          label: "Open alerts",
          description: "Saved price / news / risk rules",
          icon: <Bell className="h-3.5 w-3.5" />,
          href: "/alerts",
        },
        {
          id: "open-journal",
          label: "Open journal",
          description: "Tag, label and learn from trades",
          icon: <BookOpen className="h-3.5 w-3.5" />,
          href: "/journal",
        },
      ],
    },
    {
      id: "voice",
      title: "Voice",
      items: [
        {
          id: "tts-info",
          label: "Tap the speaker on a reply to hear AXE",
          description: "Browser SpeechSynthesis is used when available",
          icon: <Volume2 className="h-3.5 w-3.5" />,
          hint: "info",
          disabled: true,
        },
      ],
    },
    {
      id: "new",
      title: "New",
      items: [
        {
          id: "new-chat",
          label: "Start a new chat (clear focus)",
          description: "Routes to fresh chat without losing history",
          icon: <Plus className="h-3.5 w-3.5" />,
          href: "/chat",
        },
      ],
    },
  ];

  return (
    <AxeContextToolbar
      title="Chat"
      subtitle={conversationTitle ?? "AXE actions for this conversation"}
      sections={sections}
    />
  );
}
