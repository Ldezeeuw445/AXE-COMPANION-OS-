"use client";

/**
 * ChatAmbientOrb — subtle half-orb particle field above the chat composer.
 * Same visual language as AxeBreatheLoader but clipped to a half-dome,
 * creating a "living" ambient effect that connects to the AXE identity.
 *
 * Renders ~80 particles in a soft dome shape. Lightweight — no data arcs.
 */

import { useEffect, useRef } from "react";

const TAU = Math.PI * 2;

const COLORS: readonly (readonly [number, number, number])[] = [
  [200, 220, 255],
  [0, 212, 245],
  [120, 200, 255],
  [180, 240, 255],
];

interface DomeParticle {
  x: number;
  y: number;
  speed: number;
  drift: number;
  driftAmp: number;
  brightness: number;
  sizeBase: number;
  color: readonly [number, number, number];
}

function makeDomeParticles(count: number): DomeParticle[] {
  const pts: DomeParticle[] = [];
  for (let i = 0; i < count; i++) {
    // Distribute in a half-dome shape: more dense at center, sparser at edges
    const angle = TAU * Math.random();
    const r = Math.pow(Math.random(), 0.6); // bias toward center
    pts.push({
      x: Math.cos(angle) * r,
      y: -Math.abs(Math.sin(angle) * r) * 0.6, // dome: only upward
      speed: 0.005 + Math.random() * 0.015,
      drift: TAU * Math.random(),
      driftAmp: 0.01 + Math.random() * 0.03,
      brightness: 0.06 + Math.random() * 0.18,
      sizeBase: 0.3 + Math.random() * 0.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }
  return pts;
}

export function ChatAmbientOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 300;
    const H = 48;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H;
    const pts = makeDomeParticles(60);
    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      t += 0.003;

      for (const p of pts) {
        const wobbleX = p.driftAmp * Math.sin(t * 1.2 + p.drift);
        const wobbleY = p.driftAmp * Math.cos(t * 0.9 + p.drift * 1.5);
        const px = cx + (p.x + wobbleX) * (W * 0.45);
        const py = cy + (p.y + wobbleY) * (H * 1.6);

        const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + p.drift);
        const alpha = p.brightness * twinkle;

        const [cr, cg, cb] = p.color;
        ctx.beginPath();
        ctx.arc(px, py, p.sizeBase, 0, TAU);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.fill();
      }

      // Subtle center glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
      glow.addColorStop(0, `rgba(0, 212, 245, ${0.03 + 0.015 * Math.sin(t * 2)})`);
      glow.addColorStop(1, "rgba(0, 212, 245, 0)");
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, TAU);
      ctx.fillStyle = glow;
      ctx.fill();

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <div className="pointer-events-none relative h-12 shrink-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{ width: 300, height: 48 }}
      />
    </div>
  );
}
