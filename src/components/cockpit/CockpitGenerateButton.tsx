"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CockpitGenerateButton({ label }: { label?: string } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cockpit/generate", { method: "POST" });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Something went wrong");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <button
        onClick={generate}
        disabled={loading}
        className="rounded-xl bg-tos-teal/15 px-6 py-3 text-[13px] font-medium text-tos-teal transition hover:bg-tos-teal/25 disabled:opacity-50"
      >
        {loading ? "Analysing your sessions…" : (label ?? "Generate first snapshot")}
      </button>
      {error && (
        <p className="text-center text-[12px] text-red-400/80">{error}</p>
      )}
      {loading && (
        <p className="text-center text-[12px] text-tos-dim">
          AXE is reviewing your chat history. This takes about 15 seconds.
        </p>
      )}
    </div>
  );
}
