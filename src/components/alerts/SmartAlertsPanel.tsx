"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { SMART_ALERT_TEMPLATES, type SmartAlertTemplate } from "@/lib/alerts/smartAlertTemplates";

type Props = {
  onCreated?: () => void;
};

export function SmartAlertsPanel({ onCreated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enableTemplate(template: SmartAlertTemplate) {
    setBusy(template.kind);
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: template.type,
          condition: template.condition ?? null,
          keyword: template.title,
          metadata: {
            ...template.metadata,
            smartTitle: template.title,
            smartExample: template.example,
          },
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Could not enable alert");
      }
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <GlassPanel className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-400" />
        <p className="text-sm font-semibold text-tos-text">Smart alerts</p>
      </div>
      <p className="text-[12px] leading-relaxed text-tos-muted">
        AI-classified alerts with market + book context. Enable templates — AXE monitors in the background.
      </p>
      <ul className="flex flex-col gap-2">
        {SMART_ALERT_TEMPLATES.map((template) => (
          <li
            key={template.kind}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-tos-text">{template.title}</p>
                <p className="mt-0.5 text-[11px] text-tos-muted">{template.description}</p>
                <p className="mt-1.5 text-[10px] italic text-white/35">e.g. {template.example}</p>
              </div>
              <button
                type="button"
                disabled={busy === template.kind}
                onClick={() => void enableTemplate(template)}
                className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200 disabled:opacity-50"
              >
                {busy === template.kind ? "…" : "Enable"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="text-[11px] text-tos-risk">{error}</p> : null}
    </GlassPanel>
  );
}
