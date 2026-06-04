"use client";

/**
 * FullScreenLoader — AXE boot screen.
 *
 * Canvas-based:
 *   • ~200 particles that drift into a triangle formation (1.5 s ease-out)
 *   • 12 floating glass orbs (30–50 px, backdrop-filter blur)
 *   • Hex grid overlay (stroke rgba(255,255,255,0.03))
 *   • Tagline "Restoring live context…"
 *
 * Palette: cyan #00d4f5 · purple #5853b2 · violet #9270d8 · bg #060608
 */

import { useEffect, useRef, useCallback, useState } from "react";

const BG = "#060608";
const PARTICLE_COUNT = 200;
const ORB_COUNT = 12;
const FORM_DURATION = 1500; // ms — ease-out convergence
const HOLD_DURATION = 3500; // ms — hold formed triangle
const FADE_DURATION = 1200; // ms — fade to transparent

const PALETTE: readonly [number, number, number][] = [
  [0, 212, 245],   // cyan
  [88, 83, 178],   // purple
  [146, 112, 216], // violet
];

// ── Helpers ─────────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Points on an equilateral triangle centred at (cx, cy) with inradius r. */
function triangleTarget(
  index: number,
  total: number,
  cx: number,
  cy: number,
  r: number,
): [number, number] {
  // Distribute points evenly along the three edges
  const perimeterPos = index / total;
  const edgeIdx = Math.floor(perimeterPos * 3);
  const edgeFrac = (perimeterPos * 3) % 1;

  const angle0 = -Math.PI / 2; // top
  const vertices: [number, number][] = [
    [cx + r * Math.cos(angle0), cy + r * Math.sin(angle0)],
    [cx + r * Math.cos(angle0 + (2 * Math.PI) / 3), cy + r * Math.sin(angle0 + (2 * Math.PI) / 3)],
    [cx + r * Math.cos(angle0 + (4 * Math.PI) / 3), cy + r * Math.sin(angle0 + (4 * Math.PI) / 3)],
  ];

  const a = vertices[edgeIdx];
  const b = vertices[(edgeIdx + 1) % 3];
  return [lerp(a[0], b[0], edgeFrac), lerp(a[1], b[1], edgeFrac)];
}

// ── Types ───────────────────────────────────────────────────────────────

interface Particle {
  /** Random spawn position */
  sx: number;
  sy: number;
  /** Target position on triangle */
  tx: number;
  ty: number;
  color: readonly [number, number, number];
  size: number;
  /** Individual delay (0–200 ms) so they don't all arrive at once */
  delay: number;
}

interface Orb {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  opacity: number;
}

// ── Component ───────────────────────────────────────────────────────────

export function FullScreenLoader({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const startRef = useRef(0);
  const [opacity, setOpacity] = useState(1);

  const draw = useCallback(
    (particles: Particle[], orbs: Orb[], ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const now = performance.now();
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;

      // Phase timing
      const formT = Math.min(elapsed / FORM_DURATION, 1);
      const totalVisible = FORM_DURATION + HOLD_DURATION;
      const fadingOut = elapsed > totalVisible;
      const fadeT = fadingOut ? Math.min((elapsed - totalVisible) / FADE_DURATION, 1) : 0;
      const globalAlpha = 1 - fadeT;

      if (fadeT >= 1) {
        setOpacity(0);
        onDone?.();
        return; // stop loop
      }

      setOpacity(globalAlpha);

      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = globalAlpha;

      // ── Hex grid overlay ──────────────────────────────────────────────
      const hexSize = 28;
      const hexH = hexSize * Math.sqrt(3);
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 0.5;
      for (let row = -1; row < H / hexH + 1; row++) {
        for (let col = -1; col < W / (hexSize * 1.5) + 1; col++) {
          const cx = col * hexSize * 1.5;
          const cy = row * hexH + (col % 2 ? hexH / 2 : 0);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const hx = cx + hexSize * Math.cos(angle);
            const hy = cy + hexSize * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // ── Particles ─────────────────────────────────────────────────────
      for (const p of particles) {
        const pElapsed = Math.max(elapsed - p.delay, 0);
        const pFormT = easeOutCubic(Math.min(pElapsed / FORM_DURATION, 1));
        const x = lerp(p.sx, p.tx, pFormT);
        const y = lerp(p.sy, p.ty, pFormT);

        const [cr, cg, cb] = p.color;
        // Slight twinkle
        const twinkle = 0.5 + 0.5 * Math.sin(now * 0.003 + p.sx + p.sy);
        const alpha = (0.4 + 0.6 * pFormT) * twinkle;

        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.fill();
      }

      // ── Glass orbs ────────────────────────────────────────────────────
      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        // Bounce softly off edges
        if (orb.x - orb.r < 0 || orb.x + orb.r > W) orb.vx *= -1;
        if (orb.y - orb.r < 0 || orb.y + orb.r > H) orb.vy *= -1;

        const wobble = 0.7 + 0.3 * Math.sin(now * 0.001 + orb.x * 0.01);
        const a = orb.opacity * wobble;

        // Outer glow
        const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
        glow.addColorStop(0, `rgba(0,212,245,${a * 0.12})`);
        glow.addColorStop(0.5, `rgba(88,83,178,${a * 0.06})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Glass rim
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.08})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      frameRef.current = requestAnimationFrame(() => draw(particles, orbs, ctx, W, H));
    },
    [onDone],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H * 0.42;
    const triRadius = Math.min(W, H) * 0.28;

    // Build particles
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [tx, ty] = triangleTarget(i, PARTICLE_COUNT, cx, cy, triRadius);
      particles.push({
        sx: Math.random() * W,
        sy: Math.random() * H,
        tx,
        ty,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        size: 1 + Math.random() * 1.8,
        delay: Math.random() * 200,
      });
    }

    // Build glass orbs
    const orbs: Orb[] = [];
    for (let i = 0; i < ORB_COUNT; i++) {
      orbs.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 30 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        opacity: 0.3 + Math.random() * 0.4,
      });
    }

    startRef.current = 0;
    frameRef.current = requestAnimationFrame(() => draw(particles, orbs, ctx, W, H));
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-end pointer-events-auto"
      style={{ background: BG, opacity, transition: "opacity 200ms" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Tagline */}
      <p
        className="relative z-10 mb-[max(env(safe-area-inset-bottom,0px),2rem)] select-none"
        style={{
          color: "rgba(255,255,255,0.3)",
          fontSize: 12,
          letterSpacing: "0.15em",
          fontFamily: "ui-monospace, monospace",
          textTransform: "uppercase",
        }}
      >
        Restoring live context…
      </p>
    </div>
  );
}
