"use client";

/**
 * AxeAuraWave — 5-layer animated FBM wave rendered above the chat composer.
 *
 * Canvas: 100% wide, ~48 px tall, overflow-visible so thinking peaks
 * can extend beyond the strip.
 *
 * States (driven by `axe:thinking` / `axe:recording` custom events):
 *   • idle      — calm drift, small amplitude
 *   • thinking  — waves swell significantly at center, brighter, pulsing
 *   • recording — pulsing amplitude envelope
 *
 * When thinking the wave LINES themselves grow taller/louder in the center,
 * creating a clear visual that AXE is actively speaking. No separate shapes
 * or orbs — just the waves breathing.
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

function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
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
  return value / max;
}

// ── Types ───────────────────────────────────────────────────────────────

type WaveState = "idle" | "thinking" | "recording";

const STATE_CFG: Record<WaveState, { speed: number; amp: number; pulse: boolean }> = {
  idle:      { speed: 0.4,  amp: 0.55, pulse: false },
  thinking:  { speed: 0.6,  amp: 0.80, pulse: false },
  recording: { speed: 0.5,  amp: 0.75, pulse: true  },
};

// ── Component ───────────────────────────────────────────────────────────

export function AxeAuraWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const stateRef = useRef<WaveState>("idle");

  const currentSpeed = useRef(STATE_CFG.idle.speed);
  const currentAmp = useRef(STATE_CFG.idle.amp);
  const currentBoost = useRef(0); // 0 = idle, 1 = full thinking boost

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
    currentSpeed.current += (cfg.speed - currentSpeed.current) * 0.04;
    currentAmp.current += (cfg.amp - currentAmp.current) * 0.04;

    // Thinking boost lerp
    const boostTarget = stateRef.current === "thinking" ? 1 : 0;
    currentBoost.current += (boostTarget - currentBoost.current) * 0.04;
    const boost = currentBoost.current;

    const now = performance.now() * 0.001;
    const speed = currentSpeed.current;
    const baseAmp = currentAmp.current;
    const pulseEnv = cfg.pulse ? 0.8 + 0.2 * Math.sin(now * 5) : 1;

    // When thinking, add a slow breathing oscillation to the amplitude
    const breathe = boost > 0.01 ? 1 + boost * 0.2 * Math.sin(now * 1.4) : 1;

    ctx.clearRect(0, 0, W, H);

    const midY = H * 0.5;

    // ── Subtle ambient glow behind center when thinking ──────────────
    if (boost > 0.02) {
      const glowR = W * 0.22;
      const ga = boost * 0.12;
      const glow = ctx.createRadialGradient(W / 2, midY, 0, W / 2, midY, glowR);
      glow.addColorStop(0, `rgba(0,212,245,${ga})`);
      glow.addColorStop(0.6, `rgba(88,83,178,${ga * 0.4})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(W / 2 - glowR, midY - glowR, glowR * 2, glowR * 2);
    }

    // ── Wave layers ─────────────────────────────────────────────────────
    for (let layer = 0; layer < 5; layer++) {
      const color = COLORS[layer % COLORS.length];
      const [cr, cg, cb] = color;
      const layerOffset = layer * 2.7;
      const layerAmp = baseAmp * (0.6 + 0.4 * ((4 - layer) / 4)) * pulseEnv * breathe;
      const layerAlpha = 0.25 + 0.15 * ((4 - layer) / 4);

      const step = 2;
      const points: [number, number][] = [];
      for (let x = 0; x <= W; x += step) {
        const nx = x / W;
        const noise = fbm(nx * 3 + now * speed + layerOffset, 3);

        // When thinking: amplitude BOOSTS at center (Gaussian bell curve)
        // Center gets ~2.5x bigger, edges stay similar
        const centerDist = Math.abs(nx - 0.5) * 2; // 0 at center, 1 at edges
        const centerBell = Math.exp(-centerDist * centerDist * 3); // Gaussian peak at center
        const ampMultiplier = 1 + boost * 1.8 * centerBell; // up to 2.8x at center

        const y = midY + (noise - 0.5) * H * layerAmp * ampMultiplier;
        points.push([x, y]);
      }

      // Alpha boost at center when thinking
      const centerAlphaBoost = 1 + boost * 0.5;

      // 1) Glow pass
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = `blur(${6 + layer * 0.4}px)`;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${layerAlpha * 0.5 * centerAlphaBoost})`;
      ctx.lineWidth = 6 + layer * 0.5 + boost * 2;
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
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${layerAlpha * centerAlphaBoost})`;
      ctx.lineWidth = 2 + boost * 0.5;
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
    <div className="pointer-events-none relative h-9 shrink-0 overflow-visible [mask-image:linear-gradient(to_bottom,transparent_2%,black_28%,black_78%,transparent_100%)]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-90"
      />
    </div>
  );
}
