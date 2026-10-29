"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";

export function SupportForm({ priorityEligible }: { priorityEligible: boolean }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const json = (await res.json()) as { error?: string; ticket?: { priority?: boolean } };
      if (!res.ok) {
        setStatus("err");
        setError(json.error ?? "Could not send.");
        return;
      }
      setStatus("ok");
      setSubject("");
      setBody("");
    } catch {
      setStatus("err");
      setError("Network error.");
    }
  }

  return (
    <GlassPanel className="p-4">
      <form onSubmit={onSubmit} className="space-y-3">
        {priorityEligible ? (
          <p className="text-[11px] text-cyan-300/80">
            Your plan includes priority support — tickets are flagged and sorted first for the team.
          </p>
        ) : (
          <p className="text-[11px] text-tos-dim">
            Support is available on every plan. Founder and Elite tickets are flagged priority.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-tos-dim">Subject</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-tos-text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-tos-dim">Message</span>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-tos-text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={8000}
            required
          />
        </label>
        {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
        {status === "ok" ? (
          <p className="text-[11px] text-emerald-300">Sent — we&apos;ll follow up in-app / by email.</p>
        ) : null}
        <button
          type="submit"
          disabled={status === "saving"}
          className="tos-btn-cyan inline-flex w-full items-center justify-center rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60"
        >
          {status === "saving" ? "Sending…" : "Send support request"}
        </button>
      </form>
    </GlassPanel>
  );
}
