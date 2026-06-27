"use client";

import { useCallback, useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp, Bookmark } from "lucide-react";
import { TtsButton } from "@/components/chat/TtsButton";

export function ChatMessageActions({
  messageId,
  content,
  initialFeedback,
  vaultTitle = "AXE reply",
}: {
  messageId: string;
  content: string;
  initialFeedback?: "up" | "down" | null;
  vaultTitle?: string;
}) {
  const [rating, setRating] = useState<"up" | "down" | null>(initialFeedback ?? null);
  const [pending, setPending] = useState(false);
  const [vaultState, setVaultState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setRating(initialFeedback ?? null);
  }, [initialFeedback, messageId]);

  async function submitFeedback(next: "up" | "down") {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/chat/messages/${messageId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating: next }),
      });
      if (res.ok) setRating(next);
    } catch {
      /* ignore */
    } finally {
      setPending(false);
    }
  }

  const saveToVault = useCallback(async () => {
    if (vaultState !== "idle") return;
    setVaultState("saving");
    try {
      const res = await fetch("/api/vault/save-axe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title: vaultTitle }),
      });
      if (res.ok) setVaultState("saved");
      else setVaultState("idle");
    } catch {
      setVaultState("idle");
    }
  }, [content, vaultState, vaultTitle]);

  if (!content.trim()) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => void submitFeedback("up")}
          disabled={pending}
          aria-label="Helpful reply"
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
            rating === "up"
              ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200/95"
              : "border-white/[0.06] text-tos-dim hover:border-white/[0.15] hover:text-white/80"
          }`}
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => void submitFeedback("down")}
          disabled={pending}
          aria-label="Off-target reply"
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
            rating === "down"
              ? "border-rose-400/35 bg-rose-400/10 text-rose-200/95"
              : "border-white/[0.06] text-tos-dim hover:border-white/[0.15] hover:text-white/80"
          }`}
        >
          <ThumbsDown className="h-3 w-3" />
        </button>
      </span>
      <TtsButton text={content} />
      <button
        type="button"
        onClick={() => void saveToVault()}
        disabled={vaultState !== "idle"}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
          vaultState === "saved"
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
            : "border-white/[0.08] bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60"
        }`}
      >
        <Bookmark className="h-3 w-3" />
        {vaultState === "saved" ? "Saved" : vaultState === "saving" ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
