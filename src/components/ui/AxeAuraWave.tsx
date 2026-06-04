"use client";

/**
 * AxeAuraWave — 5-layer animated FBM wave rendered above the chat composer.
 *
 * Canvas: 100% wide, ~48 px tall.
 * Each layer: FBM noise (3 octaves), dual-draw (2 px sharp + 6–8 px blur,
 *   globalCompositeOperation "lighter").
 *
 * Colour cycling: cyan → purple → violet → lila → blue.
 *
 * States (driven by `axe:thinking` / `axe:recording` custom events):
 *   • idle      — calm drift
 *   • thinking  — faster wave speed, higher amplitude
 *   • recording — pulsing amplitude envelope
 */

import { useEffect, useRef, useCallback } from "react";

// ── Palette ─────────────────────────────────────────────────────────────

const COLORS: readonly [number, number, number][] = [
  [0, 212, 245],   // cyan
  [88, 83, 178],   // purple
  [146, 112, 216], // violet
  [158, 151, 208], // lila
  [0, 180, 235],   // blue
];

// ── FBM noise ───────────────────────────────────────────────────────────

/** Simple value-noise-style hash → smooth interpolation. */
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f); // smoothstep
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

function fbm(x: number, octaves = 3): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / max; // normalised 0–1
}

// ── Types ───────────────────────────────────────────────────────────────

type WaveState = "idle" | "thinking" | "recording";

const STATE_CFG: Record<WaveState, { speed: number; amp: number; pulse: boolean }> = {
  idle:      { speed: 0.4,  amp: 0.55, pulse: false },
  thinking:  { speed: 1.2,  amp: 0.85, pulse: false },
  recording: { speed: 0.7,  amp: 0.75, pulse: true  },
};

// ── Component ───────────────────────────────────────────────────────────

export function AxeAuraWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const stateRef = useRef<WaveState>("idle");

  // Smooth transition: lerp between current visual values and target
  const currentSpeed = useRef(STATE_CFG.idle.speed);
  const currentAmp = useRef(STATE_CFG.idle.amp);

  // Listen for external state changes
  useEffect(() => {
    function onThinking(e: Event) {
      const detail = (e as CustomEvent).detail;
      stateRef.current = detail?.thinking ? "thinking" : "idle";
    }
    function onRecording(e: Event) {
      const detail = (e as CustomEvent).detail;
      stateRef.current = detail?.recording ? "recording" : "idle";
    }
    window.addEventListener("axe:thinking", onThinking);
    window.addEventListener("axe:recording", onRecording);
    return () => {
      window.removeEventListener("axe:thinking", onThinking);
      window.removeEventListener("axe:recording", onRecording);
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }

    const cfg = STATE_CFG[stateRef.current];
    // Smooth lerp toward target
    currentSpeed.current += (cfg.speed - currentSpeed.current) * 0.04;
    currentAmp.current += (cfg.amp - currentAmp.current) * 0.04;

    const now = performance.now() * 0.001; // seconds
    const speed = currentSpeed.current;
    const baseAmp = currentAmp.current;

    // Recording pulse envelope
    const pulseEnv = cfg.pulse ? 0.8 + 0.2 * Math.sin(now * 5) : 1;

    ctx.clearRect(0, 0, W, H);

    const midY = H * 0.5;

    for (let layer = 0; layer < 5; layer++) {
      const color = COLORS[layer % COLORS.length];
      const [cr, cg, cb] = color;
      const layerOffset = layer * 2.7;
      const layerAmp = baseAmp * (0.6 + 0.4 * ((4 - layer) / 4)) * pulseEnv;
      const layerAlpha = 0.25 + 0.15 * ((4 - layer) / 4);

      // Build path points
      const step = 2;
      const points: [number, number][] = [];
      for (let x = 0; x <= W; x += step) {
        const nx = x / W;
        const noise = fbm(nx * 3 + now * speed + layerOffset, 3);
        const y = midY + (noise - 0.5) * H * layerAmp;
        points.push([x, y]);
      }

      // Draw twice: blur layer (glow) then sharp layer

      // 1) Glow pass
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = `blur(${6 + layer * 0.4}px)`;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${layerAlpha * 0.5})`;
      ctx.lineWidth = 6 + layer * 0.5;
      ctx.stroke();
      ctx.restore();

      // 2) Sharp pass
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${layerAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    frameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  return (
    <div className="pointer-events-none relative h-12 shrink-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
