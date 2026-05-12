"use client";

import { Suspense, useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mic, MicOff, Paperclip, Send, X, ImageIcon, ChevronRight } from "lucide-react";
import type { ChatQuotaPayload } from "@/lib/chatQuota";
import { LEGAL_COPY } from "@/lib/legal/constants";
import { detectFallbackChartActionIntent } from "@/lib/axeChartActions/chartActionBus";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "D", "W"];

const LS_SYMBOL = "axe_active_symbol";
const LS_TF = "axe_active_tf";

type ComposerProps = {
  initialQuota?: ChatQuotaPayload | null;
  /** When false, hide quota strip (e.g. demo / mock thread). */
  showQuota?: boolean;
};

function ComposerFallback() {
  return <div className="mt-3 h-24 shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.03]" aria-hidden />;
}

function toChartTfKey(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  if (normalized === "5m") return "m5";
  if (normalized === "15m") return "m15";
  if (normalized === "30m") return "m30";
  if (normalized === "1h" || normalized === "h1") return "h1";
  if (normalized === "4h" || normalized === "h4") return "h4";
  if (normalized === "d" || normalized === "1d" || normalized === "d1") return "d1";
  return "h1";
}

function chartActionHref(action: string, symbol: string, tf: string): string {
  const params = new URLSearchParams();
  params.set("symbol", symbol || "XAUUSD");
  params.set("tf", toChartTfKey(tf || "h1"));
  params.set("action", action);
  return `/chart?${params.toString()}`;
}

function ComposerInner({ initialQuota = null, showQuota = true }: ComposerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<ChatQuotaPayload | null>(initialQuota);
  const [listening, setListening] = useState(false);
  const [image, setImage] = useState<{ base64: string; type: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── Active pair / timeframe context ────────────────────────────────────────
  const [symbol, setSymbol] = useState("");
  const [tf, setTf] = useState("");
  const [editingSymbol, setEditingSymbol] = useState(false);
  const [symbolDraft, setSymbolDraft] = useState("");
  const symbolInputRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage after mount (SSR-safe)
  useEffect(() => {
    setSymbol(localStorage.getItem(LS_SYMBOL) ?? "");
    setTf(localStorage.getItem(LS_TF) ?? "");
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (!q) return;
    const decoded = decodeURIComponent(q);
    setValue((prev) => (prev.trim() ? prev : decoded));
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      if (u.searchParams.has("q")) {
        u.searchParams.delete("q");
        window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    setQuota(initialQuota);
  }, [initialQuota]);

  const loadQuota = useCallback(async () => {
    if (!showQuota) return;
    try {
      const r = await fetch("/api/chat/quota");
      if (!r.ok) return;
      const j = (await r.json()) as ChatQuotaPayload;
      setQuota(j);
    } catch {
      /* ignore */
    }
  }, [showQuota]);

  // Focus the symbol input when editing mode opens
  useEffect(() => {
    if (editingSymbol) {
      symbolInputRef.current?.focus();
      symbolInputRef.current?.select();
    }
  }, [editingSymbol]);

  function openSymbolEdit() {
    setSymbolDraft(symbol);
    setEditingSymbol(true);
  }

  function commitSymbol() {
    const upper = symbolDraft.trim().toUpperCase();
    setSymbol(upper);
    if (upper) {
      localStorage.setItem(LS_SYMBOL, upper);
    } else {
      localStorage.removeItem(LS_SYMBOL);
    }
    setEditingSymbol(false);
  }

  function cycleTf() {
    const idx = tf ? TIMEFRAMES.indexOf(tf) : -1;
    const next = idx === TIMEFRAMES.length - 1 ? "" : (TIMEFRAMES[idx + 1] ?? "");
    setTf(next);
    if (next) {
      localStorage.setItem(LS_TF, next);
    } else {
      localStorage.removeItem(LS_TF);
    }
  }

  function clearContext() {
    setSymbol("");
    setTf("");
    setEditingSymbol(false);
    localStorage.removeItem(LS_SYMBOL);
    localStorage.removeItem(LS_TF);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit() {
    const text = value.trim();
    if ((!text && !image) || sending) return;

    const chartAction = detectFallbackChartActionIntent(text);
    if (chartAction && !image) {
      setValue("");
      router.push(chartActionHref(chartAction, symbol || "XAUUSD", tf || "h1"));
      return;
    }

    setSending(true);
    setError(null);
    // Tell the message list AXE is thinking so it can show a typing
    // bubble immediately — the server round-trip can be 3-8s while AXE
    // chains tools, and silence there feels broken.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("axe:thinking", { detail: { thinking: true } }),
      );
    }
    try {
      const body: Record<string, unknown> = { text: text || "(chart attached)" };
      if (image) {
        body.imageBase64 = image.base64;
        body.imageType = image.type;
      }
      if (symbol) body.symbol = symbol;
      if (tf) body.tf = tf;

      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let resBody: { code?: string; error?: string } = {};
      try {
        resBody = (await res.json()) as { code?: string; error?: string };
      } catch {
        /* non-JSON */
      }
      if (!res.ok) {
        if (res.status === 429 && resBody.code === "CHAT_QUOTA") {
          setError(
            resBody.error ??
              "Daily free message limit reached. Upgrade to Pro for unlimited chat."
          );
          void loadQuota();
          return;
        }
        throw new Error("Message not persisted");
      }
      setValue("");
      setImage(null);
      void loadQuota();
      router.refresh();
    } catch {
      setError("Could not save message.");
    } finally {
      setSending(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("axe:thinking", { detail: { thinking: false } }),
        );
      }
    }
  }

  // ── Mic ────────────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setValue((prev) => (prev ? prev + " " + transcript : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      setError("Mic error — check browser permissions.");
    };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening]);

  // ── File ───────────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setImage({ base64, type: file.type, name: file.name });
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const hasContext = symbol || tf;

  return (
    <div className="mt-3 shrink-0 border-t border-white/[0.06] pt-3">
      {showQuota && quota?.ok ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 text-[10px] text-tos-dim">
          {quota.skipped ? (
            <span className="text-tos-dim">Quota checks off (dev)</span>
          ) : quota.remaining === -1 ? (
            <span className="text-tos-accent-cyan/90">Pro · unlimited sends</span>
          ) : (
            <span>
              <span className="text-tos-muted">{quota.remaining} sends left</span>
              <span className="text-tos-dim"> · UTC day · </span>
              <span className="text-tos-dim">limit {quota.limit ?? 20}</span>
            </span>
          )}
          {quota.remaining !== -1 && !quota.skipped ? (
            <Link
              href="/upgrade"
              className="shrink-0 font-medium text-tos-accent-cyan hover:underline"
            >
              Upgrade
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* ── Active context strip ──────────────────────────────────────────── */}
      <div className="mb-2 flex items-center gap-1.5 px-1">
        {editingSymbol ? (
          <input
            ref={symbolInputRef}
            type="text"
            value={symbolDraft}
            onChange={(e) => setSymbolDraft(e.target.value.toUpperCase())}
            onBlur={commitSymbol}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitSymbol(); }
              if (e.key === "Escape") { setEditingSymbol(false); }
            }}
            placeholder="XAUUSD"
            className="w-24 rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-tos-text focus:border-tos-accent-cyan/50 focus:outline-none"
            maxLength={10}
          />
        ) : (
          <button
            type="button"
            onClick={openSymbolEdit}
            title="Set active pair"
            className={`rounded border px-2 py-0.5 font-mono text-[11px] tracking-wider transition-colors ${
              symbol
                ? "border-tos-accent-cyan/30 bg-tos-accent-cyan/10 text-tos-accent-cyan hover:bg-tos-accent-cyan/15"
                : "border-white/[0.06] bg-white/[0.03] text-tos-dim hover:border-white/10 hover:text-tos-muted"
            }`}
          >
            {symbol || "+ pair"}
          </button>
        )}

        {/* TF chip — click to cycle */}
        <button
          type="button"
          onClick={cycleTf}
          title="Cycle timeframe"
          className={`flex items-center gap-0.5 rounded border px-2 py-0.5 font-mono text-[11px] tracking-wider transition-colors ${
            tf
              ? "border-tos-accent-cyan/30 bg-tos-accent-cyan/10 text-tos-accent-cyan hover:bg-tos-accent-cyan/15"
              : "border-white/[0.06] bg-white/[0.03] text-tos-dim hover:border-white/10 hover:text-tos-muted"
          }`}
        >
          {tf || "tf"}
          <ChevronRight className="h-2.5 w-2.5 opacity-50" />
        </button>

        {/* Clear button — only when something is set */}
        {hasContext && (
          <button
            type="button"
            onClick={clearContext}
            title="Clear pair/tf context"
            className="ml-auto text-tos-dim hover:text-tos-muted transition-colors"
            aria-label="Clear context"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* ── Image preview ────────────────────────────────────────────────── */}
      {image ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
          <ImageIcon className="h-4 w-4 shrink-0 text-tos-accent-cyan" />
          <span className="flex-1 truncate text-xs text-tos-muted">{image.name}</span>
          <button
            type="button"
            onClick={() => setImage(null)}
            className="text-tos-dim hover:text-tos-muted"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* ── Composer row ─────────────────────────────────────────────────── */}
      <div className="tos-neu-composer flex items-end gap-2 rounded-[1.15rem] p-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="tos-icon-recessed flex h-10 w-10 shrink-0 items-center justify-center text-tos-dim transition-colors hover:text-tos-muted"
          aria-label="Attach chart"
          title="Attach chart image"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={toggleMic}
          className={`tos-icon-recessed flex h-10 w-10 shrink-0 items-center justify-center transition-colors ${
            listening ? "text-tos-accent-cyan" : "text-tos-dim hover:text-tos-muted"
          }`}
          aria-label={listening ? "Stop recording" : "Voice input"}
          title={listening ? "Tap to stop" : "Voice input"}
        >
          {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <label className="sr-only" htmlFor="composer-input">
          Message
        </label>
        <textarea
          id="composer-input"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={listening ? "Listening…" : "Private channel…"}
          className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent py-2.5 text-sm text-tos-text shadow-none placeholder:text-tos-dim focus:outline-none focus:ring-0"
        />
        <button
          type="button"
          className="tos-btn-cyan flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-opacity disabled:opacity-40"
          disabled={(!value.trim() && !image) || sending}
          aria-label="Send"
          onClick={() => void submit()}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 px-1 text-center text-[10px] leading-relaxed text-tos-dim">{LEGAL_COPY.chatDisclaimer}</p>

      {error ? (
        <p className="mt-2 text-center text-[10px] text-tos-risk">{error}</p>
      ) : null}
      {listening ? (
        <p className="mt-2 text-center text-[10px] text-tos-accent-cyan animate-pulse">
          Listening — speak now
        </p>
      ) : null}
    </div>
  );
}

export function Composer(props: ComposerProps) {
  return (
    <Suspense fallback={<ComposerFallback />}>
      <ComposerInner {...props} />
    </Suspense>
  );
}
