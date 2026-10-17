"use client";

/**
 * The state of the orb sitting on the composer.
 *
 * The composer knows it is sending and whether the mic is open, but the
 * interesting part — which tool AXE reached for — arrives on the same window
 * events the thread listens to. Subscribing here keeps the orb honest
 * (`searching` while it reads your price, `composing` while it writes) instead
 * of one generic spinner, and it breathes rather than disappearing at rest, so
 * the composer always has an orb.
 */

import { useEffect, useState } from "react";
import type { OrbState } from "thinking-orbs";
import { orbForPhase } from "@/components/chat/AxeThinkingOrb";

export function useComposerOrb({
  listening,
  sending,
}: {
  listening: boolean;
  sending: boolean;
}): { state: OrbState; busy: boolean } {
  const [phase, setPhase] = useState<string | null>(null);
  const [tools, setTools] = useState<string[] | null>(null);

  useEffect(() => {
    function onThinking(e: Event) {
      const on = Boolean((e as CustomEvent<{ thinking: boolean }>).detail?.thinking);
      setPhase(on ? "thinking" : null);
      if (!on) setTools(null);
    }
    function onStatus(e: Event) {
      const detail = (e as CustomEvent<{ phase: string; tools?: string[] }>).detail;
      const next = detail?.phase ?? null;
      setPhase(next);
      setTools(next === "tools" ? (detail?.tools ?? null) : null);
    }
    window.addEventListener("axe:thinking", onThinking);
    window.addEventListener("axe:stream-status", onStatus);
    return () => {
      window.removeEventListener("axe:thinking", onThinking);
      window.removeEventListener("axe:stream-status", onStatus);
    };
  }, []);

  if (listening) return { state: "listening", busy: true };
  const busy = sending || phase != null;
  if (!busy) return { state: "breathing", busy: false };
  return { state: orbForPhase(phase, tools).state, busy: true };
}
