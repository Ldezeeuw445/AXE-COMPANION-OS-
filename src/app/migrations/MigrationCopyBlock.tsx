"use client";

import { useState } from "react";

export function MigrationCopyBlock({ filename, sql }: { filename: string; sql: string }) {
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: user can still select the <pre> block
      setCopied(false);
    }
  }

  return (
    <section className="mb-10 rounded-2xl border border-white/10 bg-tos-surface-928/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xs font-semibold text-tos-warm sm:text-sm">{filename}</h2>
        <button
          type="button"
          onClick={() => void copyAll()}
          className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-tos-text hover:bg-white/10"
        >
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>
      <pre className="tos-scrollbar max-h-[min(70vh,520px)] overflow-auto rounded-xl border border-white/[0.06] bg-black/50 p-3 text-left">
        <code className="whitespace-pre font-mono text-[11px] leading-relaxed text-tos-muted">{sql}</code>
      </pre>
    </section>
  );
}
