"use client";

import { useEffect, useRef } from "react";

/**
 * AXE Companion OS — Tetris Dot Matrix Pattern
 *
 * Canvas-based decorative pattern for the sign-in card.
 * Seeded PRNG for deterministic layout; DPR-aware rendering.
 * Two density zones (top-right + bottom-left) with corner-biased
 * distribution and subtle hue/alpha shimmer animation.
 */

/* ── Config ──────────────────────────────────────────────────────── */

const BASE_HUE    = 168;   // cyan-mint
const GRID        = 6;     // grid spacing (px)
const DOT_R       = 0.75;  // dot radius (px)
const TR_COUNT    = 65;    // shapes in top-right zone
const BL_COUNT    = 50;    // shapes in bottom-left zone
const INITIAL_SEED = 91;

/* Tetris shape templates (grid-unit offsets) */
const SHAPES: [number, number][][] = [
  [[0,0],[1,0],[2,0]],
  [[0,0],[1,0],[2,0],[3,0]],
  [[0,0],[1,0]],
  [[0,0],[0,1],[0,2]],
  [[0,0],[0,1]],
  [[0,0],[0,1],[0,2],[0,3]],
  [[0,0],[0,1],[1,1]],
  [[0,0],[1,0],[1,1]],
  [[0,0],[0,1],[1,0]],
  [[1,0],[0,1],[1,1]],
  [[0,0],[0,1],[0,2],[1,2]],
  [[0,0],[1,0],[0,1],[0,2]],
  [[0,0],[1,0],[2,0],[1,1]],
  [[0,0],[0,1],[0,2],[1,1]],
  [[0,0],[1,0],[1,1],[2,1]],
  [[1,0],[2,0],[0,1],[1,1]],
  [[0,0],[1,0],[0,1],[1,1]],
  [[0,0]], [[0,0]], [[0,0]],
  [[0,0],[2,0]],
  [[0,0],[1,1]],
  [[0,0],[2,1]],
];

/* ── Types ───────────────────────────────────────────────────────── */

type Dot = {
  x: number;
  y: number;
  alpha: number;
  phase: number;
  shimmer: number;
};

/* ── Component ───────────────────────────────────────────────────── */

export function DotPatternCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;
    const _ctx = canvas.getContext("2d");
    if (!_ctx) return;
    const ctx: CanvasRenderingContext2D = _ctx;

    const rect = container.getBoundingClientRect();
    const DPR = window.devicePixelRatio || 2;

    canvas.width = rect.width * DPR;
    canvas.height = rect.height * DPR;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(DPR, DPR);

    const CW = rect.width;
    const CH = rect.height;

    // Seeded PRNG for deterministic layout
    let seed = INITIAL_SEED;
    function rng() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    const occupied = new Set<string>();
    function key(gx: number, gy: number) { return `${gx},${gy}`; }

    function placeInZone(
      x1: number, y1: number, x2: number, y2: number,
      count: number, alphaMin: number, alphaMax: number,
      cornerX: number, cornerY: number,
    ): Dot[] {
      const dots: Dot[] = [];
      let placed = 0;
      let tries = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        let rx = rng();
        let ry = rng();
        // Corner-biased density
        if (cornerX > (x1 + x2) / 2) rx = 1 - (1 - rx) ** 1.8;
        else rx = rx ** 1.8;
        if (cornerY < (y1 + y2) / 2) ry = ry ** 1.8;
        else ry = 1 - (1 - ry) ** 1.8;

        const px = x1 + rx * (x2 - x1);
        const py = y1 + ry * (y2 - y1);
        const gx = Math.round(px / GRID);
        const gy = Math.round(py / GRID);
        const shape = SHAPES[Math.floor(rng() * SHAPES.length)];

        let valid = true;
        for (const [dx, dy] of shape) {
          const sx = (gx + dx) * GRID;
          const sy = (gy + dy) * GRID;
          if (sx < 4 || sx > CW - 4 || sy < 4 || sy > CH - 4) { valid = false; break; }
          if (occupied.has(key(gx + dx, gy + dy))) { valid = false; break; }
        }
        if (!valid) continue;

        for (const [dx, dy] of shape) occupied.add(key(gx + dx, gy + dy));

        const distToCorner = Math.sqrt(
          ((gx * GRID) - cornerX) ** 2 + ((gy * GRID) - cornerY) ** 2,
        );
        const maxDist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const fade = 1 - (distToCorner / maxDist) * 0.6;
        const shapeAlpha = (alphaMin + rng() * (alphaMax - alphaMin)) * fade;
        const shimmerOffset = rng() * Math.PI * 2;

        for (const [dx, dy] of shape) {
          dots.push({
            x: (gx + dx) * GRID,
            y: (gy + dy) * GRID,
            alpha: Math.max(0.08, shapeAlpha),
            phase: (((gx + dx) * 7 + (gy + dy) * 13) % 628) / 100,
            shimmer: shimmerOffset + rng() * 0.5,
          });
        }
        placed++;
      }
      return dots;
    }

    // Two zones: top-right corner + bottom-left corner
    const allDots: Dot[] = [
      ...placeInZone(CW * 0.25, 2, CW - 4, CH * 0.5, TR_COUNT, 0.25, 0.6, CW, 0),
      ...placeInZone(4, CH * 0.55, CW * 0.7, CH - 4, BL_COUNT, 0.22, 0.55, 0, CH),
    ];

    let t = 0;
    let rafId: number;

    function draw() {
      t++;
      ctx.clearRect(0, 0, CW, CH);
      for (const d of allDots) {
        const pulse = Math.sin(t * 0.0012 + d.phase) * 0.025;
        const a = Math.max(0.06, d.alpha + pulse);
        const hueShift = Math.sin(t * 0.0008 + d.shimmer) * 8;
        const h = BASE_HUE + hueShift;
        const s = 88 + Math.sin(t * 0.001 + d.shimmer * 1.3) * 5;
        const l = 70 + Math.sin(t * 0.0006 + d.shimmer * 0.7) * 3;
        ctx.beginPath();
        ctx.arc(d.x, d.y, DOT_R, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a.toFixed(3)})`;
        ctx.fill();
      }
      rafId = requestAnimationFrame(draw);
    }
    draw();

    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0"
      style={{ borderRadius: "inherit" }}
      aria-hidden
    />
  );
}
