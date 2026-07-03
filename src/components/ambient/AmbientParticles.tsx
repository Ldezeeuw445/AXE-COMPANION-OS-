"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * AmbientParticles — full-screen canvas rendered behind all app content.
 *
 * Inspired by the DeepBrain Chain / futuristic AI aesthetic:
 * • ~40 small particles drift slowly across the screen
 * • Faint lines connect nearby particles (neural-network feel)
 * • Ultra-low opacity so it never competes with real content
 * • Renders at 0.5× device-pixel-ratio for performance
 * • Pauses when the tab is hidden (Page Visibility API)
 * • Respects prefers-reduced-motion (disables animation)
 *
 * Controlled via localStorage key `tos-ambient` ("on" | "off").
 * Default: "on".
 */

const PARTICLE_COUNT = 40;
const CONNECT_DISTANCE = 60; // canvas-px (at 0.5× scale ≈ 120 screen-px)
const RENDER_SCALE = 0.5; // render at half resolution for perf
const SPEED_MIN = 0.04;
const SPEED_MAX = 0.14;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // radius 0.8–2.5
  alpha: number; // base opacity 0.04–0.14
  hue: "white" | "cyan";
};

function createParticle(w: number, h: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 0.4 + Math.random() * 0.9,
    alpha: 0.04 + Math.random() * 0.10,
    hue: Math.random() < 0.18 ? "cyan" : "white",
  };
}

export function AmbientParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const particles = particlesRef.current;

    ctx.clearRect(0, 0, w, h);

    // Move particles
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around edges
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;
    }

    // Draw connecting lines (neural-network feel)
    const maxDistSq = CONNECT_DISTANCE * CONNECT_DISTANCE;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distSq = dx * dx + dy * dy;
        if (distSq < maxDistSq) {
          const opacity = (1 - distSq / maxDistSq) * 0.06;
          ctx.strokeStyle = `rgba(148, 163, 184, ${opacity})`;
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    for (const p of particles) {
      const color =
        p.hue === "cyan"
          ? `rgba(0, 212, 245, ${p.alpha})`
          : `rgba(200, 210, 220, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    // Respect reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Render at reduced resolution for GPU performance
      canvas.width = Math.floor(w * RENDER_SCALE);
      canvas.height = Math.floor(h * RENDER_SCALE);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // Particles live in the scaled coordinate space
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
        createParticle(canvas.width, canvas.height)
      );
    };

    resize();
    rafRef.current = requestAnimationFrame(draw);

    window.addEventListener("resize", resize);

    // Pause when tab hidden
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
