"use client";

/**
 * AXE Loader — Particle-globe orb with glossy core.
 *
 * References:
 *  - Gleb Kuznetsov "Trading dark theme loader" (glossy 3D sphere)
 *  - Afraz "Interactive Particle Globe" (constellation dots on sphere)
 *
 * Uses a tiny <canvas> for the particle sphere + CSS overlays for
 * the glossy core highlight and glow.  Pure client — no deps.
 */

import { useEffect, useRef } from "react";

/* ─── types ─── */
type AxeBreatheLoaderProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/* ─── helpers ─── */
const TAU = Math.PI * 2;

function initParticles(count: number) {
  const pts: { phi: number; theta: number; r: number; speed: number; brightness: number }[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      phi: Math.acos(2 * Math.random() - 1),       // latitude
      theta: TAU * Math.random(),                    // longitude
      r: 0.92 + Math.random() * 0.16,               // slight depth variation
      speed: 0.08 + Math.random() * 0.12,            // rotation speed multiplier
      brightness: 0.25 + Math.random() * 0.75,
    });
  }
  return pts;
}

/* ─── component ─── */
export function AxeBreatheLoader({
  label,
  size = "md",
  className = "",
}: AxeBreatheLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const dim = size === "sm" ? 48 : size === "lg" ? 140 : 96;
  const particleCount = size === "sm" ? 90 : size === "lg" ? 280 : 160;

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
    const radius = dim * 0.38;
    const pts = initParticles(particleCount);
    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, dim, dim);
      t += 0.004;

      // Breathe scale
      const breathe = 1 + 0.03 * Math.sin(t * 2.5);

      for (const p of pts) {
        const theta = p.theta + t * p.speed;
        const sinPhi = Math.sin(p.phi);
        const x3d = Math.cos(theta) * sinPhi;
        const y3d = Math.cos(p.phi);
        const z3d = Math.sin(theta) * sinPhi;

        // Simple perspective
        const scale = 1 / (1 - z3d * 0.3);
        const px = cx + x3d * radius * p.r * breathe * scale;
        const py = cy + y3d * radius * p.r * breathe * scale;

        // Depth-based opacity: front particles brighter
        const depthAlpha = 0.08 + (z3d + 1) * 0.5 * p.brightness * 0.7;
        const dotSize = (0.5 + (z3d + 1) * 0.5) * (size === "sm" ? 0.6 : size === "lg" ? 1.1 : 0.8);

        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, TAU);
        ctx.fillStyle = `rgba(200, 220, 255, ${depthAlpha})`;
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [dim, particleCount, size]);

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
        {/* Particle canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ width: dim, height: dim }}
        />

        {/* Glossy core overlay */}
        <span
          className="absolute rounded-full"
          style={{
            top: "28%",
            left: "28%",
            width: "44%",
            height: "44%",
            background:
              "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 40%, rgba(0,212,245,0.04) 70%, transparent 100%)",
            boxShadow:
              "0 0 20px 4px rgba(0,212,245,0.08), inset 0 -4px 10px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.08)",
            animation: "axe-orb-breathe 3s ease-in-out infinite",
          }}
        />

        {/* Outer glow */}
        <span
          className="absolute inset-[-8px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(0,212,245,0.06) 0%, transparent 65%)",
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
