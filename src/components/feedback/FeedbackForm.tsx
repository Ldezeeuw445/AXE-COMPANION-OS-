"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";

export function FeedbackForm({ founderTagged }: { founderTagged: boolean }) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const form = new FormData();
      form.set("body", body);
      if (file) form.set("screenshot", file);
      const res = await fetch("/api/feedback", { method: "POST", body: form });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus("err");
        setError(json.error ?? "Could not send.");
        return;
      }
      setStatus("ok");
      setBody("");
      setFile(null);
    } catch {
      setStatus("err");
      setError("Network error.");
    }
  }

  return (
    <GlassPanel className="p-4">
      <form onSubmit={onSubmit} className="space-y-3">
        {founderTagged ? (
          <p className="text-[11px] text-tos-gold/90">
            Founder feedback — your note is tagged so the team sees it first.
          </p>
        ) : (
          <p className="text-[11px] text-tos-dim">
            Direct product feedback. Founders are tagged in the admin inbox.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-tos-dim">Feedback</span>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-tos-text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={8000}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-tos-dim">
            Screenshot (optional)
          </span>
          <input
            type="file"
            accept="image/*"
            className="block w-full text-xs text-tos-muted"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}
        {status === "ok" ? (
          <p className="text-[11px] text-emerald-300">Thanks — feedback saved.</p>
        ) : null}
        <button
          type="submit"
          disabled={status === "saving"}
          className="tos-btn-cyan inline-flex w-full items-center justify-center rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60"
        >
          {status === "saving" ? "Sending…" : "Send feedback"}
        </button>
      </form>
    </GlassPanel>
  );
}
