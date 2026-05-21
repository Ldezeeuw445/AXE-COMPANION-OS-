"use client";

/**
 * AXE Loader — Premium cinematic particle globe.
 *
 * Visual language:
 *  - Hundreds of individually-animated particles forming a sphere
 *  - Each particle has its own orbit, speed, drift, twinkle cycle
 *  - Inner "data streams" — flowing arc segments that pulse through the core
 *  - Atmospheric outer field — scattered particles that drift independently
 *  - Glossy 3D core with depth highlights
 *  - Smooth organic breathing
 *
 * Three canvas layers:
 *  1. Data streams (inner arcs pulsing)
 *  2. Sphere particles (individually animated constellation)
 *  3. Atmosphere particles (outer scattered field, slower, dimmer)
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

/* Cyan-white palette */
const COLORS: readonly (readonly [number, number, number])[] = [
  [200, 220, 255],   // cool white
  [0, 212, 245],     // AXE cyan
  [120, 200, 255],   // soft blue
  [180, 240, 255],   // pale cyan
  [0, 180, 220],     // deep cyan
  [160, 210, 245],   // ice blue
];

/* ─── sphere particle ─── */
interface SphereParticle {
  phi: number;
  theta: number;
  r: number;
  speed: number;
  brightness: number;
  drift: number;
  driftAmp: number;
  driftFreq: number;
  color: readonly [number, number, number];
  sizeBase: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

function makeSphereParticles(count: number): SphereParticle[] {
  const pts: SphereParticle[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      phi: Math.acos(2 * Math.random() - 1),
      theta: TAU * Math.random(),
      r: 0.82 + Math.random() * 0.36,
      speed: 0.02 + Math.random() * 0.12,
      brightness: 0.15 + Math.random() * 0.85,
      drift: TAU * Math.random(),
      driftAmp: 0.008 + Math.random() * 0.05,
      driftFreq: 0.6 + Math.random() * 1.8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      sizeBase: 0.3 + Math.random() * 0.7,
      twinkleSpeed: 1.5 + Math.random() * 3,
      twinklePhase: TAU * Math.random(),
    });
  }
  return pts;
}

/* ─── atmosphere particle (outer scattered field) ─── */
interface AtmosphereParticle {
  angle: number;
  radius: number;
  speed: number;
  brightness: number;
  drift: number;
  driftAmp: number;
  sizeBase: number;
  color: readonly [number, number, number];
}

function makeAtmosphereParticles(count: number): AtmosphereParticle[] {
  const pts: AtmosphereParticle[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      angle: TAU * Math.random(),
      radius: 0.52 + Math.random() * 0.48,
      speed: 0.008 + Math.random() * 0.03,
      brightness: 0.08 + Math.random() * 0.25,
      drift: TAU * Math.random(),
      driftAmp: 0.02 + Math.random() * 0.06,
      sizeBase: 0.2 + Math.random() * 0.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }
  return pts;
}

/* ─── data stream arc ─── */
interface DataStream {
  y: number;
  speed: number;
  phase: number;
  width: number;
  alpha: number;
  direction: number;
}

function makeDataStreams(count: number): DataStream[] {
  const streams: DataStream[] = [];
  for (let i = 0; i < count; i++) {
    streams.push({
      y: -0.8 + (i / (count - 1)) * 1.6,
      speed: 0.2 + Math.random() * 0.6,
      phase: TAU * Math.random(),
      width: 0.3 + Math.random() * 1.0,
      alpha: 0.04 + Math.random() * 0.1,
      direction: Math.random() > 0.5 ? 1 : -1,
    });
  }
  return streams;
}

/* ─── sizes ─── */
const SIZES = {
  sm:  { dim:  72, sphereCount: 140, atmoCount:  30, streams: 3 },
  md:  { dim: 140, sphereCount: 280, atmoCount:  60, streams: 5 },
  lg:  { dim: 260, sphereCount: 500, atmoCount: 100, streams: 8 },
} as const;

/* ─── component ─── */
export function AxeBreatheLoader({
  label,
  size = "md",
  className = "",
}: AxeBreatheLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const { dim, sphereCount, atmoCount, streams: streamCount } = SIZES[size];

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
    const R = dim * 0.34;
    const coreR = dim * 0.20;
    const atmoR = dim * 0.48;

    const spherePts = makeSphereParticles(sphereCount);
    const atmoPts = makeAtmosphereParticles(atmoCount);
    const dataStreams = makeDataStreams(streamCount);
    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, dim, dim);
      t += 0.004;

      const breathe = 1 + 0.03 * Math.sin(t * 1.8);
      const pulse = 0.7 + 0.3 * Math.sin(t * 2.5);

      /* ── Layer 1: Data streams (inner arcs) ── */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const stream of dataStreams) {
        const yPos = stream.y * coreR * breathe;
        const ringR = Math.sqrt(Math.max(0, coreR * coreR - (yPos / breathe) * (yPos / breathe))) * breathe;
        if (ringR < 2) continue;

        const angle = stream.phase + t * stream.speed * stream.direction;
        const streamPulse = 0.4 + 0.6 * Math.sin(t * 3.5 + stream.phase);

        // Draw arc with gradient fade
        const arcSteps = 20;
        for (let s = 0; s < arcSteps; s++) {
          const frac = s / arcSteps;
          const a1 = angle + stream.width * frac;
          const a2 = angle + stream.width * (frac + 1 / arcSteps);
          const fadeAlpha = stream.alpha * streamPulse * Math.sin(frac * Math.PI);

          ctx.beginPath();
          ctx.arc(cx, cy + yPos, ringR, a1, a2);
          ctx.strokeStyle = `rgba(0, 212, 245, ${fadeAlpha})`;
          ctx.lineWidth = size === "sm" ? 0.5 : size === "lg" ? 1.6 : 0.9;
          ctx.stroke();
        }
      }
      ctx.restore();

      /* ── Layer 2: Sphere particles ── */
      for (const p of spherePts) {
        const driftX = p.driftAmp * Math.sin(t * p.driftFreq + p.drift);
        const driftY = p.driftAmp * Math.cos(t * p.driftFreq * 0.7 + p.drift * 1.3);
        const theta = p.theta + t * p.speed + driftX;
        const phi = p.phi + driftY * 0.4;

        const sinPhi = Math.sin(phi);
        const x3d = Math.cos(theta) * sinPhi;
        const y3d = Math.cos(phi);
        const z3d = Math.sin(theta) * sinPhi;

        const persp = 1 / (1 - z3d * 0.3);
        const px = cx + x3d * R * p.r * breathe * persp;
        const py = cy + y3d * R * p.r * breathe * persp;

        const depthFactor = (z3d + 1) * 0.5;
        const twinkle = 0.6 + 0.4 * Math.sin(t * p.twinkleSpeed + p.twinklePhase);
        const alpha = (0.04 + depthFactor * p.brightness * 0.7) * twinkle;

        const dotR = p.sizeBase *
          (0.3 + depthFactor * 0.7) *
          (size === "sm" ? 0.5 : size === "lg" ? 1.4 : 0.9);

        const [cr, cg, cb] = p.color;

        // Glow for brighter front particles
        if (depthFactor > 0.6 && alpha > 0.25 && size !== "sm") {
          const glowR = dotR * 3;
          ctx.beginPath();
          ctx.arc(px, py, glowR, 0, TAU);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.12})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, TAU);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.fill();
      }

      /* ── Layer 3: Atmosphere particles (outer field) ── */
      for (const p of atmoPts) {
        const wobble = p.driftAmp * Math.sin(t * 0.8 + p.drift);
        const angle = p.angle + t * p.speed + wobble;
        const r = atmoR * p.radius + Math.sin(t * 0.5 + p.drift) * atmoR * 0.04;

        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;

        const twinkle = 0.5 + 0.5 * Math.sin(t * 1.5 + p.drift);
        const alpha = p.brightness * twinkle;

        const dotR = p.sizeBase * (size === "sm" ? 0.4 : size === "lg" ? 1.1 : 0.7);

        const [cr, cg, cb] = p.color;
        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, TAU);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.fill();
      }

      /* ── Layer 4: Core glow (canvas) ── */
      const glowR = coreR * 0.8 * breathe;
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      coreGlow.addColorStop(0, `rgba(0, 212, 245, ${0.08 * pulse})`);
      coreGlow.addColorStop(0.4, `rgba(0, 212, 245, ${0.03 * pulse})`);
      coreGlow.addColorStop(1, "rgba(0, 212, 245, 0)");
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, TAU);
      ctx.fillStyle = coreGlow;
      ctx.fill();

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [dim, sphereCount, atmoCount, streamCount, size]);

  const textClass = size === "sm" ? "text-[10px]" : "text-[11px]";

  return (
    <span
      className={`inline-flex flex-col items-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Globe container — slightly larger to fit atmosphere */}
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

        {/* Glossy 3D core overlay */}
        <span
          className="absolute rounded-full"
          style={{
            top: "28%",
            left: "28%",
            width: "44%",
            height: "44%",
            background:
              "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 28%, rgba(0,212,245,0.04) 55%, transparent 100%)",
            boxShadow:
              "0 0 40px 12px rgba(0,212,245,0.06), inset 0 -8px 16px rgba(0,0,0,0.40), inset 0 2px 8px rgba(255,255,255,0.06)",
            animation: "axe-orb-breathe 3s ease-in-out infinite",
          }}
        />

        {/* Outer atmospheric glow */}
        <span
          className="pointer-events-none absolute inset-[-18%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,212,245,0.04) 0%, rgba(0,212,245,0.015) 35%, transparent 65%)",
            animation: "axe-orb-glow 3s ease-in-out infinite",
          }}
        />
      </span>

      {/* Label */}
      {label && (
        <span
          className={`${textClass} font-semibold uppercase tracking-[0.18em] text-white/40`}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/** Full loading panel — centered orb + label. Seamless dark background. */
export function AxeLoadingPanel({
  label = "Restoring live context",
}: {
  label?: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-1 items-center justify-center">
      <AxeBreatheLoader label={label} size="lg" />
    </div>
  );
}
