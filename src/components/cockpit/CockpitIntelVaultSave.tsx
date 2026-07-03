"use client";

import { useCallback, useState } from "react";
import { Bookmark, Check } from "lucide-react";
import Link from "next/link";

type Props = {
  content: string;
  title?: string;
};

export function CockpitIntelVaultSave({ content, title }: Props) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const save = useCallback(async () => {
    if (!content.trim() || state !== "idle") return;
    setState("saving");
    try {
      const res = await fetch("/api/vault/save-axe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content,
          title: title ?? "AXE Intel snapshot",
          source: "intel",
        }),
      });
      setState(res.ok ? "saved" : "idle");
    } catch {
      setState("idle");
    }
  }, [content, state, title]);

  if (!content.trim()) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void save()}
        disabled={state !== "idle"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
          state === "saved"
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            : "border-[#00d4f5]/25 bg-[#00d4f5]/10 text-[#00d4f5] hover:bg-[#00d4f5]/15"
        }`}
      >
        {state === "saved" ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
        {state === "saved" ? "Saved to Vault" : state === "saving" ? "Saving…" : "Save to Vault"}
      </button>
      {state === "saved" ? (
        <Link
          href="/vault?tab=intel"
          className="text-[11px] font-medium text-[#00d4f5]/80 hover:text-[#00d4f5]"
        >
          Open Intel tab →
        </Link>
      ) : null}
    </div>
  );
}
