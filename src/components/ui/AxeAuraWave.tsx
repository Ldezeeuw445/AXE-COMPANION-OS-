"use client";

import { useEffect, useRef, useState } from "react";

type AuraState = "idle" | "thinking" | "tools" | "responding" | "recording";

const TAU = Math.PI * 2;

interface OrbParticle {
  phi: number;
  theta: number;
  r: number;
  speed: number;
  brightness: number;
  drift: number;
  driftAmp: number;
  sizeBase: number;
  twinkleSpeed: number;
  twinklePhase: number;
  noiseSeed: number;
}

function makeParticles(count: number): OrbParticle[] {
  const pts: OrbParticle[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      phi: Math.acos(2 * Math.random() - 1),
      theta: TAU * Math.random(),
      r: 0.72 + Math.random() * 0.32,
      speed: 0.012 + Math.random() * 0.09,
      brightness: 0.25 + Math.random() * 0.75,
      drift: TAU * Math.random(),
      driftAmp: 0.012 + Math.random() * 0.045,
      sizeBase: 0.28 + Math.random() * 0.62,
      twinkleSpeed: 1.1 + Math.random() * 3.2,
      twinklePhase: TAU * Math.random(),
      noiseSeed: Math.random() * TAU,
    });
  }
  return pts;
}

/** Cyan palette only — bright ice top → deep AXE cyan bottom (reference image style). */
function cyanForElevation(yNorm: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (yNorm + 1) * 0.5));
  const r = Math.round(180 + (1 - t) * 40 + t * 0);
  const g = Math.round(220 + (1 - t) * 20 + t * 32);
  const b = Math.round(255 - t * 35);
  return [r, g, b];
}

const STATE_PROFILE: Record<
  AuraState,
  { speed: number; breathe: number; glow: number; stream: number; noise: number; spin: number }
> = {
  idle: { speed: 1, breathe: 0.034, glow: 0.09, stream: 0, noise: 0.1, spin: 0.35 },
  thinking: { speed: 2.4, breathe: 0.06, glow: 0.18, stream: 0.45, noise: 0.16, spin: 0.85 },
  tools: { speed: 3, breathe: 0.065, glow: 0.2, stream: 0.55, noise: 0.18, spin: 1.05 },
  responding: { speed: 2, breathe: 0.055, glow: 0.16, stream: 0.72, noise: 0.14, spin: 0.7 },
  recording: { speed: 2.6, breathe: 0.062, glow: 0.17, stream: 0.35, noise: 0.15, spin: 0.9 },
};

export function AxeAuraWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const stateRef = useRef<AuraState>("idle");
  const targetStateRef = useRef<AuraState>("idle");
  const [state, setState] = useState<AuraState>("idle");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    function onThinking(e: Event) {
      const thinking = (e as CustomEvent<{ thinking?: boolean }>).detail?.thinking;
      if (!thinking) {
        if (targetStateRef.current !== "recording") {
          targetStateRef.current = "idle";
          setState("idle");
        }
        return;
      }
      if (targetStateRef.current === "recording") return;
      targetStateRef.current = "thinking";
      setState("thinking");
    }

    function onRecording(e: Event) {
      const recording = (e as CustomEvent<{ recording?: boolean }>).detail?.recording;
      targetStateRef.current = recording
        ? "recording"
        : targetStateRef.current === "recording"
          ? "idle"
          : targetStateRef.current;
      setState(targetStateRef.current);
    }

    function onStreamStatus(e: Event) {
      const phase = (e as CustomEvent<{ phase?: string }>).detail?.phase;
      if (targetStateRef.current === "recording") return;
      if (phase === "tools") {
        targetStateRef.current = "tools";
        setState("tools");
      } else if (phase === "responding") {
        targetStateRef.current = "responding";
        setState("responding");
      } else if (phase === "thinking") {
        targetStateRef.current = "thinking";
        setState("thinking");
      }
    }

    function onStreamToken() {
      if (targetStateRef.current === "recording") return;
      targetStateRef.current = "responding";
      setState("responding");
    }

    window.addEventListener("axe:thinking", onThinking);
    window.addEventListener("axe:recording", onRecording);
    window.addEventListener("axe:stream-status", onStreamStatus);
    window.addEventListener("axe:stream-token", onStreamToken);
    return () => {
      window.removeEventListener("axe:thinking", onThinking);
      window.removeEventListener("axe:recording", onRecording);
      window.removeEventListener("axe:stream-status", onStreamStatus);
      window.removeEventListener("axe:stream-token", onStreamToken);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dim = 80;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dim * dpr;
    canvas.height = dim * dpr;
    ctx.scale(dpr, dpr);

    const cx = dim / 2;
    const cy = dim / 2;
    const R = dim * 0.36;
    const coreR = dim * 0.22;
    const pts = makeParticles(240);
    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, dim, dim);
      t += 0.0055;

      const profile = STATE_PROFILE[stateRef.current];
      const breathe = 1 + profile.breathe * Math.sin(t * (1.5 * profile.speed));
      const pulse = 0.6 + 0.4 * Math.sin(t * (2.4 * profile.speed));
      const globalSpin = t * profile.spin;

      const sorted = pts
        .map((p) => {
          const driftX = p.driftAmp * Math.sin(t * profile.speed * 1.1 + p.drift);
          const driftY = p.driftAmp * Math.cos(t * profile.speed * 0.85 + p.drift * 1.3);
          const theta = p.theta + globalSpin + t * p.speed * profile.speed + driftX;
          const phi = p.phi + driftY * 0.4;

          const surfaceNoise =
            1 +
            profile.noise *
              (Math.sin(theta * 3 + t * 1.6 + p.noiseSeed) * 0.45 +
                Math.cos(phi * 4 - t * 1.2 + p.noiseSeed * 1.7) * 0.35 +
                Math.sin((theta + phi) * 2 + t * 2.1) * 0.2);

          const sinPhi = Math.sin(phi);
          const x3d = Math.cos(theta) * sinPhi;
          const y3d = Math.cos(phi);
          const z3d = Math.sin(theta) * sinPhi;

          const persp = 1 / (1 - z3d * 0.32);
          const radius = R * p.r * breathe * surfaceNoise * persp;
          const px = cx + x3d * radius;
          const py = cy + y3d * radius;

          return { p, px, py, y3d, z3d, persp, surfaceNoise };
        })
        .sort((a, b) => a.z3d - b.z3d);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (const item of sorted) {
        const { p, px, py, y3d, z3d } = item;
        const depthFactor = (z3d + 1) * 0.5;
        const twinkle = 0.5 + 0.5 * Math.sin(t * p.twinkleSpeed * profile.speed + p.twinklePhase);
        const alpha = (0.06 + depthFactor * p.brightness * 0.82) * twinkle;

        const [cr, cg, cb] = cyanForElevation(y3d);
        const dotR = p.sizeBase * (0.32 + depthFactor * 0.68) * 0.52;

        if (depthFactor > 0.5 && alpha > 0.15) {
          ctx.beginPath();
          ctx.arc(px, py, dotR * 3.2, 0, TAU);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.14})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, TAU);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.fill();
      }

      ctx.restore();

      const glowR = coreR * breathe * (1 + profile.stream * 0.2);
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      coreGlow.addColorStop(0, `rgba(200, 240, 255, ${profile.glow * pulse * 0.9})`);
      coreGlow.addColorStop(0.35, `rgba(0, 212, 245, ${profile.glow * pulse * 0.55})`);
      coreGlow.addColorStop(0.7, `rgba(0, 160, 210, ${profile.glow * pulse * 0.2})`);
      coreGlow.addColorStop(1, "rgba(0, 212, 245, 0)");
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, TAU);
      ctx.fillStyle = coreGlow;
      ctx.fill();

      if (profile.stream > 0) {
        for (let i = 0; i < 4; i++) {
          const angle = t * profile.speed * 1.6 + (i / 4) * TAU;
          const ringR = coreR * (0.75 + i * 0.08) * breathe;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, angle, angle + 0.4 + profile.stream);
          ctx.strokeStyle = `rgba(0, 212, 245, ${0.06 + profile.stream * 0.14})`;
          ctx.lineWidth = 0.7 + profile.stream * 0.4;
          ctx.stroke();
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <div className="pointer-events-none mb-0.5 flex h-14 items-center justify-center" aria-hidden>
      <div className="relative" style={{ width: 80, height: 80 }}>
        <canvas ref={canvasRef} className="absolute inset-0" style={{ width: 80, height: 80 }} />
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            top: "26%",
            left: "26%",
            width: "48%",
            height: "48%",
            background:
              "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.18) 0%, rgba(200,240,255,0.06) 35%, rgba(0,212,245,0.04) 60%, transparent 100%)",
            boxShadow: "0 0 36px 10px rgba(0,212,245,0.12), inset 0 -5px 12px rgba(0,80,120,0.35)",
            animation: "axe-orb-breathe 2.8s ease-in-out infinite",
          }}
        />
        <span
          className="pointer-events-none absolute inset-[-28%] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(0,212,245,0.08) 0%, rgba(0,212,245,0.02) 40%, transparent 68%)",
            animation: "axe-orb-glow 2.8s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
