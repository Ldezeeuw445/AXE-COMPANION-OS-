"use client";

import { useMemo, useState } from "react";
import type { VaultMediaItem, VaultNote } from "@/types/domain";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { ImageIcon, Mic, FileText } from "lucide-react";

type VaultClientProps = {
  notes: VaultNote[];
  media: VaultMediaItem[];
};

type Tab = "all" | "notes" | "media" | "voice";

export function VaultClient({ notes, media }: VaultClientProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const voiceItems = useMemo(
    () => media.filter((m) => m.type === "voice"),
    [media]
  );
  const visualItems = useMemo(
    () => media.filter((m) => m.type !== "voice"),
    [media]
  );

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const hay = `${n.title} ${n.body} ${n.tags.join(" ")} ${n.symbol ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [notes, q]);

  const filteredVisual = useMemo(() => {
    return visualItems.filter((m) => {
      const hay = `${m.title} ${m.tags.join(" ")} ${m.symbol ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [visualItems, q]);

  const filteredVoice = useMemo(() => {
    return voiceItems.filter((m) => {
      const hay = `${m.title} ${m.tags.join(" ")}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [voiceItems, q]);

  const showNotes = tab === "all" || tab === "notes";
  const showVisual = tab === "all" || tab === "media";
  const showVoice = tab === "all" || tab === "voice";

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search symbol, tag, title…"
        className="tos-neu-inset mb-3 w-full rounded-xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
      />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["all", "All"],
            ["notes", "Notes"],
            ["media", "Images"],
            ["voice", "Voice"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
              tab === key
                ? "border-[color:var(--icon-vault)]/40 bg-white/[0.06] text-[color:var(--icon-vault)]"
                : "border-tos-border text-tos-dim hover:text-tos-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {showNotes
          ? filteredNotes.map((n) => (
              <GlassPanel key={n.id} className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--icon-vault)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-tos-text">
                        {n.title}
                      </h3>
                      {n.symbol ? (
                        <Badge variant="neutral">{n.symbol}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-tos-muted">
                      {n.body}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {n.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-tos-dim"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassPanel>
            ))
          : null}

        {showVisual
          ? filteredVisual.map((m) => (
              <GlassPanel key={m.id} className="p-4">
                <div className="flex gap-3">
                  <div className="tos-inset-panel flex h-14 w-14 shrink-0 items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-tos-news" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-tos-text">
                        {m.title}
                      </h3>
                      <Badge variant="neutral">{m.type.replace("_", " ")}</Badge>
                    </div>
                    {m.symbol ? (
                      <p className="mt-1 font-mono text-xs text-tos-price">
                        {m.symbol}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-tos-dim">
                      {m.thumbHint ?? "Storage path wired in Phase 2"}
                    </p>
                  </div>
                </div>
              </GlassPanel>
            ))
          : null}

        {showVoice
          ? filteredVoice.map((m) => (
              <GlassPanel key={m.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Mic className="h-5 w-5 text-tos-audio" />
                  <div>
                    <p className="text-sm font-medium text-tos-text">
                      {m.title}
                    </p>
                    <p className="text-[10px] text-tos-dim">
                      Voice memo · tap to play (Phase 2)
                    </p>
                  </div>
                </div>
              </GlassPanel>
            ))
          : null}
      </div>
    </>
  );
}
