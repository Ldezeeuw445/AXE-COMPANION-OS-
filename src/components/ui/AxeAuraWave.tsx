"use client";

import { useEffect, useMemo, useState } from "react";

type AuraState = "idle" | "thinking" | "recording";

export function AxeAuraWave() {
  const [state, setState] = useState<AuraState>("idle");

  useEffect(() => {
    function onThinking(e: Event) {
      const detail = (e as CustomEvent<{ thinking?: boolean }>).detail;
      setState(detail?.thinking ? "thinking" : "idle");
    }

    function onRecording(e: Event) {
      const detail = (e as CustomEvent<{ recording?: boolean }>).detail;
      setState(detail?.recording ? "recording" : "idle");
    }

    window.addEventListener("axe:thinking", onThinking);
    window.addEventListener("axe:recording", onRecording);
    return () => {
      window.removeEventListener("axe:thinking", onThinking);
      window.removeEventListener("axe:recording", onRecording);
    };
  }, []);

  const visual = useMemo(() => {
    if (state === "thinking") {
      return {
        scale: 1.1,
        glow: 0.68,
        ring: 0.8,
        pulseClass: "animate-pulse",
      };
    }
    if (state === "recording") {
      return {
        scale: 1.16,
        glow: 0.8,
        ring: 0.95,
        pulseClass: "animate-pulse",
      };
    }
    return {
      scale: 1,
      glow: 0.38,
      ring: 0.5,
      pulseClass: "",
    };
  }, [state]);

  return (
    <div className="pointer-events-none mb-1 flex h-8 items-center justify-center">
      <div
        className="relative h-7 w-7 transition-all duration-500 ease-out"
        style={{ transform: `scale(${visual.scale})` }}
        aria-hidden
      >
        <span
          className={`absolute inset-[-16px] rounded-full bg-cyan-400/30 blur-xl transition-opacity duration-500 ${visual.pulseClass}`}
          style={{ opacity: visual.glow }}
        />
        <span
          className="absolute inset-[-6px] rounded-full border border-cyan-300/35 transition-opacity duration-500"
          style={{ opacity: visual.ring }}
        />
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.8),rgba(0,212,245,0.92)_42%,rgba(20,120,220,0.9)_100%)] shadow-[0_0_24px_rgba(0,212,245,0.55)]" />
      </div>
    </div>
  );
}
