"use client";

/**
 * AxeAuraWave — 5-layer animated FBM wave with orbital orb mode.
 *
 * Canvas: 100% wide, 48 px tall, overflow-visible so glow bleeds out.
 *
 * States (driven by `axe:thinking` / `axe:recording` custom events):
 *   • idle      — calm horizontal waves drifting across
 *   • thinking  — waves converge to center, orbital rings + glowing core appear
 *   • recording — pulsing amplitude envelope
 *
 * When thinking, the wave strip transforms: waves bunch into the center,
 * 4 rotating elliptical orbits appear (FBM-distorted), and a multi-layer
 * radial glow gives a concentrated energy-orb effect.
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
  thinking:  { speed: 1.2,  amp: 0.85, pulse: false },
  recording: { speed: 0.7,  amp: 0.75, pulse: true  },
};

// ── Component ───────────────────────────────────────────────────────────

export function AxeAuraWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const stateRef = useRef<WaveState>("idle");

  const currentSpeed = useRef(STATE_CFG.idle.speed);
  const currentAmp = useRef(STATE_CFG.idle.amp);
  const currentSphere = useRef(0); // 0 = flat waves, 1 = full orb

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

    const now = performance.now() * 0.001;
    const speed = currentSpeed.current;
    const baseAmp = currentAmp.current;
    const pulseEnv = cfg.pulse ? 0.8 + 0.2 * Math.sin(now * 5) : 1;

    // Sphere lerp — target 0.92 when thinking for dramatic convergence
    const sphereTarget = stateRef.current === "thinking" ? 0.92 : 0;
    currentSphere.current += (sphereTarget - currentSphere.current) * 0.035;
    const sT = currentSphere.current;

    ctx.clearRect(0, 0, W, H);

    const midY = H * 0.5;
    const cX = W * 0.5;

    // ── 1. Horizontal waves (converge to center when thinking) ──────
    for (let layer = 0; layer < 5; layer++) {
      const color = COLORS[layer % COLORS.length];
      const [cr, cg, cb] = color;
      const layerOffset = layer * 2.7;
      const layerAmp = baseAmp * (0.6 + 0.4 * ((4 - layer) / 4)) * pulseEnv;
      const layerAlpha = 0.25 + 0.15 * ((4 - layer) / 4);

      // When converged, the wave alpha fades at edges
      const step = 2;
      const points: [number, number][] = [];
      for (let x = 0; x <= W; x += step) {
        const nx = x / W;
        const noise = fbm(nx * 3 + now * speed + layerOffset, 3);
        const centerDist = Math.abs(nx - 0.5) * 2;
        // Stronger exponential convergence — waves nearly vanish at edges
        const sphereEnv = 1 - sT * Math.pow(centerDist, 1.4);
        const y = midY + (noise - 0.5) * H * layerAmp * Math.max(sphereEnv, 0);
        points.push([x, y]);
      }

      // Edge-fade alpha: when in sphere mode, fade the wave alpha at the edges
      // We draw segments with varying alpha for a nicer falloff

      // 1) Glow pass
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = `blur(${6 + layer * 0.4}px)`;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      const glowAlpha = layerAlpha * 0.5 * (1 + sT * 0.6); // brighter at center when converged
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${glowAlpha})`;
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
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${layerAlpha * (1 + sT * 0.4)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // ── 2. Orbital rings (appear when thinking) ─────────────────────
    if (sT > 0.05) {
      const orbAlpha = Math.min(sT / 0.5, 1); // fade in over first 50% of transition
      const orbCount = 4;
      const maxR = H * 0.45; // max orbit radius — fits within the strip

      for (let o = 0; o < orbCount; o++) {
        const color = COLORS[o % COLORS.length];
        const [cr, cg, cb] = color;
        const baseAngle = (o / orbCount) * Math.PI + now * (0.6 + o * 0.15);
        const rX = maxR * (0.55 + 0.45 * ((orbCount - o) / orbCount)); // x radius
        const rY = maxR * (0.4 + 0.3 * ((orbCount - o) / orbCount)); // y radius (elliptical)
        const tilt = (o / orbCount) * Math.PI * 0.6; // tilt each orbit differently

        const segments = 80;
        const points: [number, number][] = [];
        for (let s = 0; s <= segments; s++) {
          const angle = (s / segments) * Math.PI * 2;
          // FBM distortion on radius for organic feel
          const rNoise = 1 + (fbm(angle * 2 + now * 1.5 + o * 3, 2) - 0.5) * 0.35;
          const px = Math.cos(angle + baseAngle) * rX * rNoise;
          // Apply tilt: mix Y with a bit of X rotation
          const pyRaw = Math.sin(angle + baseAngle) * rY * rNoise;
          const py = pyRaw * Math.cos(tilt) + px * Math.sin(tilt) * 0.15;
          points.push([cX + px, midY + py]);
        }

        // Glow pass
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = `blur(${4 + o}px)`;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${orbAlpha * 0.25})`;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        // Sharp pass
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${orbAlpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 3. Multi-layer center glow (orb core) ──────────────────────
    if (sT > 0.05) {
      const ga = sT;

      // Layer 1: Large outer bloom — soft cyan
      const r1 = Math.min(W * 0.18, H * 1.2);
      const g1 = ctx.createRadialGradient(cX, midY, 0, cX, midY, r1);
      g1.addColorStop(0, `rgba(0,212,245,${ga * 0.18})`);
      g1.addColorStop(0.4, `rgba(88,83,178,${ga * 0.08})`);
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(cX - r1, midY - r1, r1 * 2, r1 * 2);

      // Layer 2: Medium purple/violet ring
      const r2 = H * 0.6;
      const g2 = ctx.createRadialGradient(cX, midY, r2 * 0.15, cX, midY, r2);
      g2.addColorStop(0, `rgba(146,112,216,${ga * 0.2})`);
      g2.addColorStop(0.5, `rgba(88,83,178,${ga * 0.1})`);
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(cX - r2, midY - r2, r2 * 2, r2 * 2);

      // Layer 3: Inner white-hot core — pulsing
      const corePulse = 1 + 0.2 * Math.sin(now * 4);
      const r3 = H * 0.2 * corePulse;
      const g3 = ctx.createRadialGradient(cX, midY, 0, cX, midY, r3);
      g3.addColorStop(0, `rgba(220,240,255,${ga * 0.6})`);
      g3.addColorStop(0.3, `rgba(0,212,245,${ga * 0.35})`);
      g3.addColorStop(0.7, `rgba(88,83,178,${ga * 0.12})`);
      g3.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g3;
      ctx.fillRect(cX - r3, midY - r3, r3 * 2, r3 * 2);

      // Layer 4: Tiny bright center point
      const r4 = H * 0.06 * corePulse;
      const g4 = ctx.createRadialGradient(cX, midY, 0, cX, midY, r4);
      g4.addColorStop(0, `rgba(255,255,255,${ga * 0.9})`);
      g4.addColorStop(1, `rgba(0,212,245,${ga * 0.0})`);
      ctx.fillStyle = g4;
      ctx.fillRect(cX - r4, midY - r4, r4 * 2, r4 * 2);
    }

    frameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  return (
    <div className="pointer-events-none relative h-12 shrink-0 overflow-visible">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
