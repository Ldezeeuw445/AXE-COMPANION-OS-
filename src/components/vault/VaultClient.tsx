"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { VaultMediaItem, VaultNote } from "@/types/domain";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";
import { ImageIcon, Mic, FileText } from "lucide-react";
import { MarkdownLite } from "@/components/ui/MarkdownLite";

type VaultClientProps = {
  notes: VaultNote[];
  media: VaultMediaItem[];
};

type Tab = "all" | "axe" | "intel" | "notes" | "media" | "voice";

export function VaultClient({ notes, media }: VaultClientProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab === "intel" || initialTab === "axe" || initialTab === "notes" || initialTab === "media" || initialTab === "voice") {
      return initialTab;
    }
    return "all";
  });

  const voiceItems = useMemo(
    () => media.filter((m) => m.type === "voice"),
    [media]
  );
  const visualItems = useMemo(
    () => media.filter((m) => m.type !== "voice"),
    [media]
  );

  const axeNotes = useMemo(
    () =>
      notes.filter((n) => {
        const tags = (n.tags ?? []).map((t) => t.toLowerCase());
        return tags.includes("axe") && !tags.includes("axe-intel");
      }),
    [notes],
  );

  const intelNotes = useMemo(
    () => notes.filter((n) => (n.tags ?? []).map((t) => t.toLowerCase()).includes("axe-intel")),
    [notes],
  );

  const filteredIntel = useMemo(() => {
    return intelNotes.filter((n) => {
      const hay = `${n.title} ${n.body} ${n.tags.join(" ")} ${n.symbol ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [intelNotes, q]);

  const manualNotes = useMemo(
    () =>
      notes.filter((n) => {
        const tags = (n.tags ?? []).map((t) => t.toLowerCase());
        return !tags.includes("axe") && !tags.includes("axe-intel");
      }),
    [notes],
  );

  const filteredAllNotes = useMemo(() => {
    return notes.filter((n) => {
      const hay = `${n.title} ${n.body} ${n.tags.join(" ")} ${n.symbol ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [notes, q]);

  const filteredManualNotes = useMemo(() => {
    return manualNotes.filter((n) => {
      const hay = `${n.title} ${n.body} ${n.tags.join(" ")} ${n.symbol ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [manualNotes, q]);

  const filteredAxe = useMemo(() => {
    return axeNotes.filter((n) => {
      const hay = `${n.title} ${n.body} ${n.tags.join(" ")} ${n.symbol ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [axeNotes, q]);

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

  const showAxe = tab === "axe";
  const showIntel = tab === "intel";
  const showNotes = tab === "all" || tab === "notes";
  const notesToRender = tab === "notes" ? filteredManualNotes : filteredAllNotes;
  const showVisual = tab === "all" || tab === "media";
  const showVoice = tab === "all" || tab === "voice";
  const hasMedia = visualItems.length > 0 || voiceItems.length > 0;

  const tabOptions = (
    [
      ["all", "All"],
      ["axe", `AXE${axeNotes.length ? ` (${axeNotes.length})` : ""}`],
      ["intel", `Intel${intelNotes.length ? ` (${intelNotes.length})` : ""}`],
      ["notes", `Notes${manualNotes.length ? ` (${manualNotes.length})` : ""}`],
      ...(visualItems.length ? ([["media", `Images (${visualItems.length})`]] as const) : []),
      ...(voiceItems.length ? ([["voice", `Voice (${voiceItems.length})`]] as const) : []),
    ] as const
  );

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
        {tabOptions.map(([key, label]) => (
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

      {!hasMedia && tab === "all" && notes.length === 0 ? (
        <GlassPanel className="mb-4 p-4 text-center">
          <p className="text-sm font-medium text-tos-text">Vault is ready for your first save</p>
          <p className="mt-1 text-xs leading-relaxed text-tos-muted">
            Bookmark an AXE reply in Chat, or add journal notes — they land here automatically.
          </p>
          <p className="mt-2 text-[10px] text-tos-dim">
            Screenshots and voice memos are coming soon.
          </p>
        </GlassPanel>
      ) : null}

      <div className="flex flex-col gap-4">
        {showAxe
          ? filteredAxe.map((n) => (
              <GlassPanel key={n.id} className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--tos-accent-cyan)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="long">AXE</Badge>
                      <h3 className="text-sm font-medium text-tos-text">{n.title}</h3>
                      {n.symbol ? <Badge variant="neutral">{n.symbol}</Badge> : null}
                    </div>
                    <MarkdownLite
                      content={n.body}
                      className="mt-2 space-y-2 text-xs text-tos-muted"
                      paragraphClassName="whitespace-pre-wrap text-xs leading-relaxed text-tos-muted"
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {n.tags
                        .filter((t) => t.toLowerCase() !== "axe")
                        .map((t) => (
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
        {showAxe && filteredAxe.length === 0 ? (
          <GlassPanel className="p-4 text-center">
            <p className="text-sm font-medium text-tos-text">No AXE replies saved yet</p>
            <p className="mt-1 text-xs text-tos-muted">
              In Chat, tap the bookmark on any AXE reply to save it here.
            </p>
          </GlassPanel>
        ) : null}

        {showIntel && filteredIntel.length === 0 ? (
          <GlassPanel className="p-4 text-center">
            <p className="text-sm font-medium text-tos-text">No intel saved yet</p>
            <p className="mt-1 text-xs text-tos-muted">
              In AXE Intelligence chat, tap the bookmark on any intel reply to save it here.
            </p>
          </GlassPanel>
        ) : null}
        {showIntel
          ? filteredIntel.map((n) => (
              <GlassPanel key={n.id} className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#00d4f5]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="long">Intel</Badge>
                      <h3 className="text-sm font-medium text-tos-text">{n.title}</h3>
                      {n.symbol ? <Badge variant="neutral">{n.symbol}</Badge> : null}
                    </div>
                    <MarkdownLite
                      content={n.body}
                      className="mt-2 space-y-2 text-xs text-tos-muted"
                      paragraphClassName="whitespace-pre-wrap text-xs leading-relaxed text-tos-muted"
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {n.tags
                        .filter((t) => t.toLowerCase() !== "axe-intel")
                        .map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-[#00d4f5]/10 px-2 py-0.5 text-[10px] text-[#00d4f5]/80"
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

        {showNotes
          ? notesToRender.map((n) => (
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
                    <MarkdownLite
                      content={n.body}
                      className="mt-2 space-y-2 text-xs text-tos-muted"
                      paragraphClassName="whitespace-pre-wrap text-xs leading-relaxed text-tos-muted"
                    />
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

        {showNotes && !showAxe && !showIntel && notesToRender.length === 0 ? (
          <GlassPanel className="p-4 text-center">
            <p className="text-sm font-medium text-tos-text">No notes yet</p>
            <p className="mt-1 text-xs text-tos-muted">
              Save AXE replies from Chat, or ask AXE to help you draft checklists to store here.
            </p>
          </GlassPanel>
        ) : null}

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
                      {m.thumbHint ?? "Saved to your vault"}
                    </p>
                  </div>
                </div>
              </GlassPanel>
            ))
          : null}

        {showVisual && filteredVisual.length === 0 && tab === "media" ? (
          <GlassPanel className="p-4 text-center">
            <p className="text-sm font-medium text-tos-text">Images coming soon</p>
            <p className="mt-1 text-xs text-tos-muted">
              Chart screenshots and uploads will appear here once media capture ships.
            </p>
          </GlassPanel>
        ) : null}

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
                      Voice memo · playback coming soon
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
