"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "axe.splashSeen.v1";
const AUTO_DISMISS_MS = 9400;

export function SplashOverlay() {
  // Default to hidden so the splash never blocks the UI on subsequent
  // visits (and never flashes a black screen during SSR hydration). We
  // flip it to true in useEffect only when this device hasn't seen it.
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
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <iframe
        src="/splash.html"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
        title="AXE Companion OS"
        sandbox="allow-scripts"
      />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Skip intro"
        style={{
          position: "absolute",
          // Sits clear of the iPhone notch / Dynamic Island while staying
          // tappable on devices without one.
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
    </div>
  );
}
