"use client";

/**
 * AxeDotLoader — minimal 16-dot grid loader.
 *
 * 4 columns × 4 rows of small dots that pulse sequentially.
 * Renders on a pure black full-screen background.
 * No box, no text, no "Running..." — just dots.
 */

import { type CSSProperties } from "react";

const ROWS = 4;
const COLS = 4;
const DOT_SIZE = 6;
const GAP = 10;
const CYAN = "#00d4f5";

function dotStyle(index: number): CSSProperties {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  const delay = (row * COLS + col) * 0.08; // stagger across grid

  return {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: "50%",
    background: CYAN,
    opacity: 0.25,
    animation: `axe-dot-pulse 1.2s ease-in-out ${delay}s infinite`,
  };
}

export function AxeDotLoader() {
  return (
    <div
      className="fixed inset-0 z-[998] flex items-center justify-center"
      style={{ background: "#000000" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${DOT_SIZE}px)`,
          gap: GAP,
        }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => (
          <span key={i} style={dotStyle(i)} />
        ))}
      </div>

      <style>{`
        @keyframes axe-dot-pulse {
          0%, 100% { opacity: 0.2; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
