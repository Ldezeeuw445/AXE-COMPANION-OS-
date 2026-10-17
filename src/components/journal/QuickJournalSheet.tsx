"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon, Mic, Square, X } from "lucide-react";
import {
  applySessionAccount,
  directionLabel,
  formatDraftPnl,
  formatPrice,
  priceDigits,
  type QuickJournalDraft,
} from "@/lib/journal/quickJournalDraft";
import { JOURNAL_TAG_COLORS, JOURNAL_TRADE_TAGS } from "@/lib/journal/tradeTags";
import { captureRegisteredChartFrame, hasRegisteredChartFrameCapture } from "@/lib/journal/chartCaptureRegistry";
import {
  blobToBase64,
  enqueueJournalAttachment,
  enqueueJournalSave,
  flushOfflineJournalQueue,
} from "@/lib/journal/flushOfflineJournalQueue";
import { useActiveSession } from "@/lib/session/activeSessionStore";
import type { JournalAttachmentKind } from "@/lib/journal/attachmentPath";

const SHEET_BOTTOM = "calc(4.1rem + env(safe-area-inset-bottom, 0px) + 0.85rem)";

type PendingFile = {
  id: string;
  kind: JournalAttachmentKind;
  file: File;
  transcript?: string | null;
};

type SpeechRecCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  start: () => void;
  stop: () => void;
};

export type QuickJournalSheetProps = {
  draft: QuickJournalDraft;
  persist?: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function QuickJournalSheet({ draft: incoming, persist = true, onClose, onSaved }: QuickJournalSheetProps) {
  const session = useActiveSession();
  const draft = applySessionAccount(incoming, session);
  const [label, setLabel] = useState<string | null>(draft.label);
  const [note, setNote] = useState(draft.note ?? "");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveTranscriptRef = useRef("");
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add("trade-sheet-open");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("trade-sheet-open");
      document.body.style.overflow = prev;
    };
  }, []);

  const digits = priceDigits(draft.openPrice);
  const axeText = draft.axe.explanation || draft.axe.axeNote;
  const canSave = Boolean(label || note.trim() || pending.length > 0);

  const addPending = useCallback((kind: JournalAttachmentKind, file: File, transcript?: string | null) => {
    setPending((prev) => [
      ...prev,
      { id: `${kind}-${Date.now()}-${prev.length}`, kind, file, transcript: transcript ?? null },
    ]);
  }, []);

  const stopRecognition = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  };

  const startVoice = useCallback(async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("Voice notes need a browser that can record audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      liveTranscriptRef.current = "";
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        stopRecognition();
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], `voice-${Date.now()}.${mime.includes("mp4") ? "m4a" : "webm"}`, {
          type: mime,
        });
        addPending("voice", file, liveTranscriptRef.current.trim() || null);
        setRecording(false);
        if (persist) {
          void (async () => {
            const form = new FormData();
            form.set("file", file);
            try {
              const res = await fetch("/api/journal/transcribe", { method: "POST", credentials: "include", body: form });
              const data = (await res.json()) as { transcript?: string | null };
              if (data.transcript) {
                liveTranscriptRef.current = data.transcript;
                setPending((prev) =>
                  prev.map((p) => (p.file === file ? { ...p, transcript: data.transcript } : p)),
                );
                setNote((n) => (n.trim() ? n : data.transcript ?? n));
              }
            } catch {
              /* audio-only is fine */
            }
          })();
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setStatus("Recording… tap again to stop.");

      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor })
          .SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: SpeechRecCtor }).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recg = new SpeechRecognition();
        recg.continuous = true;
        recg.interimResults = true;
        recg.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
        recg.onresult = (ev) => {
          const text = Array.from(ev.results)
            .map((r) => r[0]?.transcript ?? "")
            .join(" ")
            .trim();
          liveTranscriptRef.current = text;
        };
        recg.start();
        recognitionRef.current = recg;
      }
    } catch {
      setStatus("Microphone permission was denied.");
    }
  }, [addPending, persist, recording]);

  const captureChart = useCallback(async () => {
    setStatus("Capturing chart…");
    const blob = await captureRegisteredChartFrame();
    if (!blob) {
      setStatus("No live chart to snapshot. Open the chart first.");
      return;
    }
    addPending("chart", new File([blob], `chart-${Date.now()}.png`, { type: "image/png" }));
    setStatus("Chart snapshot attached.");
  }, [addPending]);

  const save = useCallback(async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setStatus(null);

    const payload = {
      tradeId: draft.tradeId,
      accountId: draft.accountId,
      label,
      note: note.trim() || null,
    };

    const offline = typeof navigator !== "undefined" && navigator.onLine === false;

    const persistSave = async (): Promise<"ok" | "queued" | "error"> => {
      if (!persist) return "ok";
      if (offline) {
        enqueueJournalSave(payload);
        return "queued";
      }
      try {
        const res = await fetch("/api/journal/quick", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) return "ok";
        enqueueJournalSave(payload);
        return "queued";
      } catch {
        enqueueJournalSave(payload);
        return "queued";
      }
    };

    const persistFiles = async (): Promise<"ok" | "queued"> => {
      if (!persist || pending.length === 0) return "ok";
      let queued = false;
      for (const item of pending) {
        if (offline) {
          enqueueJournalAttachment({
            kind: "attachment",
            tradeId: draft.tradeId,
            accountId: draft.accountId,
            attachmentKind: item.kind,
            fileName: item.file.name,
            mime: item.file.type,
            bytesBase64: await blobToBase64(item.file),
            transcript: item.transcript,
          });
          queued = true;
          continue;
        }
        const form = new FormData();
        form.set("tradeId", draft.tradeId);
        form.set("accountId", draft.accountId);
        form.set("kind", item.kind);
        if (item.transcript) form.set("transcript", item.transcript);
        form.set("file", item.file, item.file.name);
        try {
          const res = await fetch("/api/journal/attachments", {
            method: "POST",
            credentials: "include",
            body: form,
          });
          if (!res.ok) {
            enqueueJournalAttachment({
              kind: "attachment",
              tradeId: draft.tradeId,
              accountId: draft.accountId,
              attachmentKind: item.kind,
              fileName: item.file.name,
              mime: item.file.type,
              bytesBase64: await blobToBase64(item.file),
              transcript: item.transcript,
            });
            queued = true;
          }
        } catch {
          enqueueJournalAttachment({
            kind: "attachment",
            tradeId: draft.tradeId,
            accountId: draft.accountId,
            attachmentKind: item.kind,
            fileName: item.file.name,
            mime: item.file.type,
            bytesBase64: await blobToBase64(item.file),
            transcript: item.transcript,
          });
          queued = true;
        }
      }
      return queued ? "queued" : "ok";
    };

    const saveState = await persistSave();
    const fileState = await persistFiles();
    if (persist && !offline) void flushOfflineJournalQueue();

    setBusy(false);
    if (saveState === "error") {
      setStatus("Could not save.");
      return;
    }
    setSaved(true);
    setStatus(saveState === "queued" || fileState === "queued" ? "Saved locally — will upload when you are back online." : "Saved.");
    onSaved?.();
    window.setTimeout(onClose, persist ? 700 : 400);
  }, [busy, canSave, draft.accountId, draft.tradeId, label, note, onClose, onSaved, pending, persist]);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[110]" data-testid="quick-journal-sheet">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} aria-hidden />
        <div
          className="absolute left-1/2 w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-2xl border-t border-white/[0.08] bg-[#111115] px-5 pt-4 pb-4"
          style={{
            bottom: SHEET_BOTTOM,
            maxHeight: `calc(100dvh - ${SHEET_BOTTOM} - env(safe-area-inset-top, 0px) - 0.5rem)`,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
            WebkitOverflowScrolling: "touch",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Quick journal"
        >
          <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/10" />
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Quick journal</p>
              <p className="mt-0.5 font-mono text-[15px] font-semibold text-white" data-testid="quick-journal-symbol">
                {draft.symbol}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-[11px]">
            <div>
              <p className="text-white/30">Direction</p>
              <p
                className={`font-semibold ${draft.side === "buy" ? "text-cyan-300" : "text-rose-300"}`}
                data-testid="quick-journal-direction"
              >
                {directionLabel(draft.side)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/30">Net P&L</p>
              <p
                className={`font-mono font-semibold tabular-nums ${draft.netPnl >= 0 ? "text-cyan-300" : "text-rose-300"}`}
                data-testid="quick-journal-pnl"
              >
                {formatDraftPnl(draft)}
              </p>
            </div>
            <div>
              <p className="text-white/30">Entry → exit</p>
              <p className="font-mono tabular-nums text-white/80" data-testid="quick-journal-entry-exit">
                <span data-testid="quick-journal-entry">{formatPrice(draft.openPrice, digits)}</span>
                {" → "}
                <span data-testid="quick-journal-exit">{formatPrice(draft.closePrice, digits)}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/30">Account</p>
              <p className="truncate text-white/80" data-testid="quick-journal-account">
                {draft.accountLabel ?? "Active account"}
              </p>
            </div>
          </div>

          {axeText || draft.axe.axeLabel ? (
            <div
              className="mb-3 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] px-3 py-2"
              data-testid="quick-journal-axe-draft"
            >
              <p className="text-[9px] font-semibold uppercase tracking-widest text-cyan-400/50">AXE draft</p>
              <p className="mt-1 text-[12px] text-cyan-50/90">
                {draft.axe.axeLabel ? `${draft.axe.axeLabel}` : "Unscored"}
                {draft.axe.alignmentScore != null ? ` · ${draft.axe.alignmentScore}` : ""}
              </p>
              {axeText ? <p className="mt-1 text-[11px] leading-relaxed text-white/55">{axeText}</p> : null}
            </div>
          ) : (
            <p className="mb-3 text-[11px] text-white/35" data-testid="quick-journal-axe-draft">
              AXE will score this close in the background — add your note now.
            </p>
          )}

          <div className="mb-3 flex flex-wrap gap-1.5">
            {JOURNAL_TRADE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setLabel(label === tag ? null : tag)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                  label === tag ? JOURNAL_TAG_COLORS[tag] : "border-white/[0.08] bg-white/[0.03] text-white/40"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <textarea
            data-testid="quick-journal-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you see? One sentence is enough."
            rows={3}
            className="mb-3 w-full resize-none rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[13px] text-white/85 placeholder:text-white/25 focus:border-white/[0.14] focus:outline-none"
          />

          {pending.length > 0 ? (
            <ul className="mb-3 space-y-1" data-testid="quick-journal-pending">
              {pending.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2 py-1 text-[11px] text-white/70">
                  <span className="truncate">
                    {item.kind}
                    {item.transcript ? ` · ${item.transcript.slice(0, 40)}` : ""}
                  </span>
                  <button
                    type="button"
                    className="text-white/35"
                    onClick={() => setPending((prev) => prev.filter((p) => p.id !== item.id))}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              data-testid="quick-journal-voice"
              onClick={() => void startVoice()}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-medium ${
                recording
                  ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
                  : "border-white/[0.08] bg-white/[0.03] text-white/70"
              }`}
            >
              {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {recording ? "Stop" : "Voice"}
            </button>
            <button
              type="button"
              data-testid="quick-journal-photo"
              onClick={() => photoRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-2 text-[11px] font-medium text-white/70"
            >
              <Camera className="h-3.5 w-3.5" />
              Photo
            </button>
            <button
              type="button"
              data-testid="quick-journal-screenshot"
              onClick={() => shotRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-2 text-[11px] font-medium text-white/70"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Shot
            </button>
            <button
              type="button"
              data-testid="quick-journal-chart"
              onClick={() => void captureChart()}
              disabled={!hasRegisteredChartFrameCapture() && persist}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-2 text-[11px] font-medium text-white/70 disabled:opacity-40"
            >
              Chart
            </button>
          </div>

          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addPending("photo", file);
              e.target.value = "";
            }}
          />
          <input
            ref={shotRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addPending("screenshot", file);
              e.target.value = "";
            }}
          />

          {status ? (
            <p className="mb-2 text-[11px] text-white/45" data-testid="quick-journal-status">
              {status}
            </p>
          ) : null}

          <button
            type="button"
            data-testid="quick-journal-save"
            onClick={() => void save()}
            disabled={busy || !canSave}
            className="w-full rounded-xl bg-cyan-400/90 px-3 py-2.5 text-[13px] font-semibold text-black disabled:opacity-40"
          >
            {busy ? "Saving…" : saved ? "Saved" : "Save journal"}
          </button>
        </div>
      </div>
    </BodyPortal>
  );
}
