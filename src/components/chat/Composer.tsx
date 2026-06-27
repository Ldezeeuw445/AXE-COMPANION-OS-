"use client";

/**
 * AXEComposer — streamlined chat input.
 *
 * Pair/TF selection has moved to PinnedContext.
 * Queries-left count is now in the placeholder: "Ask AXE… · 12 queries left"
 * Buttons: attach, mic (skeu inset), send (cyan).
 *
 * All business logic (submit, speech-to-text, image attach, chart-action
 * detection, optimistic bubbles, quota refresh) is preserved unchanged.
 */

import { Suspense, useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CHAT_PREFILL_EVENT,
  clearStagedChatPrefill,
  readStagedChatPrefill,
} from "@/lib/chat/chatPrefill";
import { Send, X, ImageIcon } from "lucide-react";
import { useChatIntelMode } from "@/components/chat/ChatHeaderSwitch";
import type { ChatQuotaPayload } from "@/lib/chatQuota";
import { detectFallbackChartActionIntent } from "@/lib/axeChartActions/chartActionBus";
import { useAmbient } from "@/components/ambient/AmbientProvider";
import { AxeAuraWave } from "@/components/ui/AxeAuraWave";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

const LS_SYMBOL = "axe_active_symbol";
const LS_TF = "axe_active_tf";

type ComposerProps = {
  initialQuota?: ChatQuotaPayload | null;
  showQuota?: boolean;
};

function ComposerFallback() {
  return (
    <div
      className="mt-3 h-16 shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.03]"
      aria-hidden
    />
  );
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

function inferIndicatorLayers(text: string): string[] {
  const n = text.toLowerCase();
  const layers: string[] = [];
  if (n.includes("ifvg")) layers.push("ifvg");
  else if (n.includes("fvg")) layers.push("fvg");
  if (n.includes("structure")) layers.push("structure");
  if (n.includes("order block") || n.includes("orderblock") || n.includes(" ob")) layers.push("orderBlocks");
  if (n.includes("rsi")) layers.push("rsi");
  if (n.includes("rsi") === false && n.includes(" ma")) layers.push("ma");
  return layers;
}

function chartActionHref(action: string, symbol: string, tf: string, layers?: string[]): string {
  const params = new URLSearchParams();
  params.set("symbol", symbol || "XAUUSD");
  params.set("tf", toChartTfKey(tf || "h1"));
  params.set("action", action);
  if (action === "add_indicator" && layers?.length) {
    params.set("layers", layers.join(","));
  }
  return `/chart?${params.toString()}`;
}

function ComposerInner({ initialQuota = null, showQuota = true }: ComposerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { vibrate } = useAmbient();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<ChatQuotaPayload | null>(initialQuota);
  const [listening, setListening] = useState(false);
  const [image, setImage] = useState<{ base64: string; type: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const appliedPrefillRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const focusDraft = useCallback((draft: string) => {
    const el = textareaRef.current;
    if (!el) return false;
    el.focus();
    el.setSelectionRange(draft.length, draft.length);
    return true;
  }, []);

  const applyDraft = useCallback(
    (draft: string) => {
      const trimmed = draft.trim();
      if (!trimmed) return;
      if (appliedPrefillRef.current === trimmed) return;
      appliedPrefillRef.current = trimmed;
      setValue(trimmed);
      clearStagedChatPrefill();
      requestAnimationFrame(() => {
        if (focusDraft(trimmed)) return;
        window.setTimeout(() => {
          focusDraft(trimmed);
        }, 64);
      });
    },
    [focusDraft],
  );

  // Read pair/TF from localStorage (PinnedContext writes these)
  const getSymbol = useCallback(() => {
    try { return localStorage.getItem(LS_SYMBOL) ?? ""; } catch { return ""; }
  }, []);
  const getTf = useCallback(() => {
    try { return localStorage.getItem(LS_TF) ?? ""; } catch { return ""; }
  }, []);

  const resolvePrefillDraft = useCallback((): string | null => {
    const staged = readStagedChatPrefill();
    if (staged?.trim()) return staged;
    const q = searchParams.get("q");
    if (!q) return null;
    try {
      return decodeURIComponent(q);
    } catch {
      return q;
    }
  }, [searchParams]);

  // Prefill from staged session draft or ?q= query param (layout effect for mobile/iPad)
  useLayoutEffect(() => {
    if (pathname !== "/chat") return;
    const draft = resolvePrefillDraft();
    if (!draft) return;
    applyDraft(draft);
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      if (u.searchParams.has("q")) {
        u.searchParams.delete("q");
        window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
      }
    }
  }, [pathname, resolvePrefillDraft, applyDraft]);

  // Retry staged prefill after portal mount on touch devices
  useEffect(() => {
    if (pathname !== "/chat") return;
    const draft = readStagedChatPrefill();
    if (!draft?.trim()) return;
    const timers = [96, 240].map((ms) =>
      window.setTimeout(() => {
        applyDraft(draft);
      }, ms),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [pathname, applyDraft]);

  // Same-route prefill from Actions / chart workflows while Composer stays mounted
  useEffect(() => {
    function onPrefill(e: Event) {
      const ce = e as CustomEvent<{ text?: string }>;
      const text = ce.detail?.text;
      if (text) applyDraft(text);
    }
    window.addEventListener(CHAT_PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(CHAT_PREFILL_EVENT, onPrefill);
  }, [applyDraft]);

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

  // ── Placeholder with queries-left ─────────────────────────────────────
  const placeholder = (() => {
    if (listening) return "Listening…";
    if (!showQuota || !quota?.ok) return "Ask AXE…";
    if (quota.skipped || quota.remaining === -1) return "Ask AXE…";
    return `Ask AXE… · ${quota.remaining} queries left`;
  })();

  // ── Submit (streaming) ─────────────────────────────────────────────────
  async function submit() {
    const text = value.trim();
    if ((!text && !image) || sending) return;

    const symbol = getSymbol();
    const tf = getTf();

    const chartAction = detectFallbackChartActionIntent(text);
    if (chartAction && !image) {
      setValue("");
      const layers = chartAction === "add_indicator" ? inferIndicatorLayers(text) : undefined;
      router.push(chartActionHref(chartAction, symbol || "XAUUSD", tf || "h1", layers));
      return;
    }

    setSending(true);
    setError(null);
    if (typeof window !== "undefined") {
      const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      window.dispatchEvent(
        new CustomEvent("axe:user-message", {
          detail: {
            id: optimisticId,
            content: text || "(chart attached)",
            createdAt: new Date().toISOString(),
            hasImage: Boolean(image),
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("axe:thinking", { detail: { thinking: true } }),
      );
    }

    const body: Record<string, unknown> = {
      text: text || "(chart attached)",
      type: intelMode ? "intel" : "axe",
    };
    if (image) {
      body.imageBase64 = image.base64;
      body.imageType = image.type;
    }
    if (symbol) body.symbol = symbol;
    if (tf) body.tf = tf;

    // Clear input immediately
    const inputText = value;
    setValue("");
    setImage(null);

    try {
      // Get Supabase session token so server-side auth works even if cookies
      // aren't forwarded (common on Vercel deployments).
      let authHeader: Record<string, string> = {};
      try {
        const sb = createClient();
        const { data: { session } } = await sb.auth.getSession();
        if (session?.access_token) {
          authHeader = { Authorization: `Bearer ${session.access_token}` };
        }
      } catch {
        // Silently ignore — server will try cookie auth as fallback
      }

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        // Fallback: try non-streaming route
        const fallback = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!fallback.ok) throw new Error("Message not persisted");
        void loadQuota();
        router.refresh();
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(chunk, { stream: true });

        // Parse SSE lines
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "token" && data.text) {
                window.dispatchEvent(
                  new CustomEvent("axe:stream-token", { detail: { text: data.text } }),
                );
              } else if (currentEvent === "status") {
                window.dispatchEvent(
                  new CustomEvent("axe:stream-status", { detail: data }),
                );
              } else if (currentEvent === "done") {
                // Stream complete — refresh to load persisted messages from DB
                void loadQuota();
                router.refresh();
              } else if (currentEvent === "error") {
                const msg = data.message ?? "AXE encountered an error.";
                if (msg.includes("limit reached") || msg.includes("Upgrade")) {
                  setError(msg);
                  void loadQuota();
                } else {
                  setError(msg);
                }
              }
            } catch {
              /* malformed JSON line — skip */
            }
          }
        }
      }
    } catch {
      setValue(inputText); // Restore input on failure
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

  // ── Mic ───────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      window.dispatchEvent(new CustomEvent("axe:recording", { detail: { recording: false } }));
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
    rec.onend = () => {
      setListening(false);
      window.dispatchEvent(new CustomEvent("axe:recording", { detail: { recording: false } }));
    };
    rec.onerror = () => {
      setListening(false);
      window.dispatchEvent(new CustomEvent("axe:recording", { detail: { recording: false } }));
      setError("Mic error — check browser permissions.");
    };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    window.dispatchEvent(new CustomEvent("axe:recording", { detail: { recording: true } }));
  }, [listening]);

  // ── File ──────────────────────────────────────────────────────────────
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

  const intelMode = useChatIntelMode();

  async function runQuickAction(draft: string) {
    setValue(draft);
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    void submit();
  }

  return (
    <div className="mt-auto shrink-0 overflow-visible px-1 pb-1 pt-0">
      {/* ── Image preview ────────────────────────────────────────────── */}
      {image ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
          <ImageIcon className="h-4 w-4 shrink-0 text-[#00d4f5]" />
          <span className="flex-1 truncate text-xs text-white/50">{image.name}</span>
          <button
            type="button"
            onClick={() => setImage(null)}
            className="text-white/25 hover:text-white/50"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* ── Unified composer bar: quick actions + typing in one row (intel only) ─── */}
      <div className="relative overflow-visible">
        {intelMode ? (
        <>
        <div
          className="pointer-events-none absolute left-1/2 bottom-full z-0 flex -translate-x-1/2 translate-y-[54%] justify-center xl:hidden"
          aria-hidden
        >
          <AxeAuraWave variant="composer" />
        </div>
          <div
            className="relative z-10 flex items-center gap-1 overflow-hidden rounded-full border border-white/[0.08] px-1.5 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
            style={{
              background: "linear-gradient(180deg, #121216 0%, #0a0a0c 100%)",
            }}
          >
            {/* Brief All */}
            <button
              type="button"
              onClick={() => void runQuickAction("Give me a full market brief for today.")}
              className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Brief All
            </button>

            {/* Divider */}
            <span className="h-4 w-px bg-white/10" />

            {/* Top Risks */}
            <button
              type="button"
              onClick={() => void runQuickAction("What are the top risks to watch today?")}
              className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Top Risks
            </button>

            {/* Divider */}
            <span className="h-4 w-px bg-white/10" />

            {/* Ask anything input */}
            <label className="sr-only" htmlFor="composer-input">
              Message
            </label>
            <textarea
              ref={textareaRef}
              id="composer-input"
              rows={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => {
                window.dispatchEvent(new CustomEvent("axe:chat-pin"));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask anything..."
              className="max-h-20 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-white/90 shadow-none placeholder:text-white/25 focus:outline-none focus:ring-0"
            />

            {/* Send button */}
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
              style={{
                background: "#00d4f5",
                boxShadow: "0 0 10px rgba(0,212,245,0.3), 0 2px 8px rgba(0,0,0,0.3)",
              }}
              disabled={(!value.trim() && !image) || sending}
              aria-label="Send"
              onClick={() => {
                vibrate("medium");
                void submit();
              }}
            >
              <Send className="h-4 w-4 text-black" />
            </button>
          </div>
        </>
        ) : (
          // AXE default composer — unchanged simple bar
          <div
            className="relative z-10 flex items-center gap-2 overflow-hidden rounded-lg border border-white/[0.06] px-3 py-2"
            style={{ background: "linear-gradient(180deg, #0f0f11 0%, #070708 100%)" }}
          >
            <textarea
              ref={textareaRef}
              id="composer-input"
              rows={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => {
                window.dispatchEvent(new CustomEvent("axe:chat-pin"));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={placeholder}
              className="flex-1 resize-none border-0 bg-transparent px-2 py-1 text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
            />
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00d4f5]"
              disabled={(!value.trim() && !image) || sending}
              aria-label="Send"
              onClick={() => {
                vibrate("medium");
                void submit();
              }}
            >
              <Send className="h-4 w-4 text-black" />
            </button>
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-2 text-center text-[10px] text-red-400/90">{error}</p>
      ) : null}
      {listening ? (
        <p className="mt-2 text-center text-[10px] text-[#00d4f5] animate-pulse">
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
