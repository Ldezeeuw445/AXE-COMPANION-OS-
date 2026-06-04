"use client";

import { useState } from "react";
import { FullScreenLoader } from "@/components/ui/FullScreenLoader";

export function SplashOverlay() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  function dismiss() {
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
