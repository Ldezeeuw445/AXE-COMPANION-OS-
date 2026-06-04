"use client";

import { useEffect, useState } from "react";
import { FullScreenLoader } from "@/components/ui/FullScreenLoader";

const SEEN_KEY = "axe.splashSeen.v1";

export function SplashOverlay() {
  // Default to hidden so the splash never blocks the UI on subsequent
  // visits (and never flashes during SSR hydration). We flip it to true
  // in useEffect only when this device hasn't seen it.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Private mode / Safari quirks — fall through and just show once.
    }
    if (alreadySeen) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore — best effort
    }
    setVisible(false);
  }

  return (
    <>
      <FullScreenLoader onDone={dismiss} />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Skip intro"
        style={{
          position: "fixed",
          zIndex: 1000,
          top: "max(env(safe-area-inset-top, 0px), 14px)",
          right: "max(env(safe-area-inset-right, 0px), 14px)",
          padding: "8px 14px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(8,12,18,0.72)",
          color: "rgba(255,255,255,0.92)",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          cursor: "pointer",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Skip
      </button>
    </>
  );
}
