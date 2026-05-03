"use client";

import { useEffect, useState } from "react";

export function SplashOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 9400);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

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
    </div>
  );
}
