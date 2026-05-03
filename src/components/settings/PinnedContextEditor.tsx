"use client";

import { useState, useTransition } from "react";
import { updatePinnedContext } from "@/app/(app)/settings/actions";

type Props = {
  conversationId: string;
  initialValue: string;
};

export function PinnedContextEditor({ conversationId, initialValue }: Props) {
  const [text, setText] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePinnedContext(conversationId, text);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-tos-text placeholder:text-tos-dim focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
        rows={5}
        placeholder={
          "Tell AXE what to always remember — your session bias, active pairs, key levels, preferred style...\n\nExample:\nBias: Long XAUUSD, Short DXY\nKey levels: 2320, 2345, 2380\nStyle: ICT concepts, 15m entries"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-white/10 px-4 py-1.5 text-xs font-medium text-tos-text hover:bg-white/15 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-tos-long">Saved — AXE will use this on every message</span>
        )}
        {error && <span className="text-xs text-tos-short">{error}</span>}
      </div>
    </div>
  );
}
