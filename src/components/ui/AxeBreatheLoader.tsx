"use client";

/**
 * AXE Loader — Premium living-globe orb.
 *
 * References:
 *  - Gleb Kuznetsov "Trading dark theme loader" (glossy 3D sphere)
 *  - Afraz "Interactive Particle Globe" (constellation dots forming sphere)
 *  - DeepBrain Chain (floating ambient particles)
 *
 * Three visual layers on <canvas>:
 *  1. Outer constellation — hundreds of dots orbiting a sphere
 *  2. Inner data rings — horizontal scan-lines / arcs that pulse,
 *     giving the impression of data flowing through the core
 *  3. Glossy core — radial-gradient CSS overlay for 3D depth
 *
 * Pure client, zero deps beyond React.
 */

import { useEffect, useRef } from "react";

/* ─── types ─── */
type AxeBreatheLoaderProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/* ─── constants ─── */
const TAU = Math.PI * 2;

/* Cyan-white palette for particles */
const COLORS = [
  [200, 220, 255],  // cool white
  [0, 212, 245],    // AXE cyan
  [120, 200, 255],  // soft blue
  [180, 240, 255],  // pale cyan
] as const;

/* ─── particle factory ─── */
interface Particle {
  phi: number;
  theta: number;
  r: number;          // radius multiplier (depth variation)
  speed: number;      // rotation speed
  brightness: number;
  drift: number;      // independent wobble phase offset
  driftAmp: number;   // wobble amplitude
  color: readonly [number, number, number];
  sizeBase: number;   // dot radius base
}

function makeParticles(count: number): Particle[] {
  const pts: Particle[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      phi: Math.acos(2 * Math.random() - 1),
      theta: TAU * Math.random(),
      r: 0.88 + Math.random() * 0.24,
      speed: 0.04 + Math.random() * 0.14,
      brightness: 0.2 + Math.random() * 0.8,
      drift: TAU * Math.random(),
      driftAmp: 0.01 + Math.random() * 0.04,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      sizeBase: 0.4 + Math.random() * 0.6,
    });
  }
  return pts;
}

/* ─── data-ring factory ─── */
interface DataRing {
  y: number;          // normalised y position on sphere (-1..1)
  speed: number;      // rotation speed
  phase: number;      // starting angle offset
  width: number;      // arc length in radians
  alpha: number;      // base opacity
}

function makeDataRings(count: number): DataRing[] {
  const rings: DataRing[] = [];
  for (let i = 0; i < count; i++) {
    rings.push({
      y: -0.7 + (i / (count - 1)) * 1.4,
      speed: 0.3 + Math.random() * 0.5,
      phase: TAU * Math.random(),
      width: 0.4 + Math.random() * 1.2,
      alpha: 0.06 + Math.random() * 0.12,
    });
  }
  return rings;
}

/* ─── sizes ─── */
const SIZES = {
  sm:  { dim:  64, particles: 120, rings: 4 },
  md:  { dim: 120, particles: 220, rings: 6 },
  lg:  { dim: 200, particles: 400, rings: 8 },
} as const;

/* ─── component ─── */
export function AxeBreatheLoader({
  label,
  size = "md",
  className = "",
}: AxeBreatheLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const { dim, particles: particleCount, rings: ringCount } = SIZES[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dim * dpr;
    canvas.height = dim * dpr;
    ctx.scale(dpr, dpr);

    const cx = dim / 2;
    const cy = dim / 2;
    const R = dim * 0.38;          // globe radius
    const coreR = dim * 0.22;      // inner core radius for data rings

    const pts = makeParticles(particleCount);
    const rings = makeDataRings(ringCount);
    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, dim, dim);
      t += 0.005;

      // Breathe: gentle scale pulse
      const breathe = 1 + 0.025 * Math.sin(t * 2.2);

      /* ── Layer 1: Inner data rings ── */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const ring of rings) {
        const yPos = ring.y * coreR * breathe;
        const ringR = Math.sqrt(Math.max(0, coreR * coreR - (yPos / breathe) * (yPos / breathe))) * breathe;
        if (ringR < 2) continue;

        const angle = ring.phase + t * ring.speed;
        const pulse = 0.6 + 0.4 * Math.sin(t * 3 + ring.phase);

        ctx.beginPath();
        ctx.arc(cx, cy + yPos, ringR, angle, angle + ring.width);
        ctx.strokeStyle = `rgba(0, 212, 245, ${ring.alpha * pulse})`;
        ctx.lineWidth = size === "sm" ? 0.5 : size === "lg" ? 1.4 : 0.8;
        ctx.stroke();
      }
      ctx.restore();

      /* ── Layer 2: Constellation particles ── */
      for (const p of pts) {
        // Independent drift per particle — they don't just rigidly rotate
        const driftOffset = p.driftAmp * Math.sin(t * 1.8 + p.drift);
        const theta = p.theta + t * p.speed + driftOffset;
        const phi = p.phi + driftOffset * 0.3;

        const sinPhi = Math.sin(phi);
        const x3d = Math.cos(theta) * sinPhi;
        const y3d = Math.cos(phi);
        const z3d = Math.sin(theta) * sinPhi;

        // Perspective projection
        const persp = 1 / (1 - z3d * 0.28);
        const px = cx + x3d * R * p.r * breathe * persp;
        const py = cy + y3d * R * p.r * breathe * persp;

        // Depth-based: front brighter, back dimmer
        const depthFactor = (z3d + 1) * 0.5;
        const alpha = (0.06 + depthFactor * p.brightness * 0.65) *
          (0.8 + 0.2 * Math.sin(t * 2 + p.drift)); // subtle twinkle

        const dotR = p.sizeBase *
          (0.4 + depthFactor * 0.6) *
          (size === "sm" ? 0.5 : size === "lg" ? 1.3 : 0.85);

        const [cr, cg, cb] = p.color;

        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, TAU);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.fill();
      }

      /* ── Layer 3: Core glow (canvas) ── */
      const glowR = coreR * 0.7 * breathe;
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      coreGlow.addColorStop(0, `rgba(0, 212, 245, ${0.06 + 0.03 * Math.sin(t * 2)})`);
      coreGlow.addColorStop(0.5, "rgba(0, 212, 245, 0.02)");
      coreGlow.addColorStop(1, "rgba(0, 212, 245, 0)");
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, TAU);
      ctx.fillStyle = coreGlow;
      ctx.fill();

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [dim, particleCount, ringCount, size]);

  const textClass = size === "sm" ? "text-[10px]" : "text-[11px]";

  return (
    <span
      className={`inline-flex flex-col items-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Globe container */}
      <span
        className="relative"
        style={{ width: dim, height: dim }}
        aria-hidden
      >
        {/* Particle canvas — full globe */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ width: dim, height: dim }}
        />

        {/* Glossy core — CSS overlay for 3D depth illusion */}
        <span
          className="absolute rounded-full"
          style={{
            top: "24%",
            left: "24%",
            width: "52%",
            height: "52%",
            background:
              "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 30%, rgba(0,212,245,0.05) 60%, transparent 100%)",
            boxShadow:
              "0 0 30px 8px rgba(0,212,245,0.07), inset 0 -6px 14px rgba(0,0,0,0.35), inset 0 2px 6px rgba(255,255,255,0.07)",
            animation: "axe-orb-breathe 3s ease-in-out infinite",
          }}
        />

        {/* Outer atmospheric glow */}
        <span
          className="pointer-events-none absolute inset-[-16%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,212,245,0.05) 0%, rgba(0,212,245,0.02) 40%, transparent 70%)",
            animation: "axe-orb-glow 3s ease-in-out infinite",
          }}
        />
      </span>

      {/* Label */}
      {label && (
        <span
          className={`${textClass} font-semibold uppercase tracking-[0.16em] text-white/50`}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/** Full loading panel — centered orb + label. No border, no block. */
export function AxeLoadingPanel({
  label = "Restoring live context",
}: {
  label?: string;
}) {
  return (
    <div className="flex min-h-[240px] flex-1 items-center justify-center">
      <AxeBreatheLoader label={label} size="lg" />
    </div>
  );
}
