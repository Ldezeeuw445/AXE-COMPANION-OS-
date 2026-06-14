"use client";

import { useEffect, useRef, useState } from "react";

type AuraState = "idle" | "thinking" | "tools" | "responding" | "recording";

const TAU = Math.PI * 2;

const COLORS: readonly (readonly [number, number, number])[] = [
  [200, 220, 255],
  [0, 212, 245],
  [120, 200, 255],
  [180, 240, 255],
  [0, 180, 220],
];

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
  color: readonly [number, number, number];
}

function makeParticles(count: number): OrbParticle[] {
  const pts: OrbParticle[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      phi: Math.acos(2 * Math.random() - 1),
      theta: TAU * Math.random(),
      r: 0.78 + Math.random() * 0.28,
      speed: 0.015 + Math.random() * 0.08,
      brightness: 0.2 + Math.random() * 0.75,
      drift: TAU * Math.random(),
      driftAmp: 0.01 + Math.random() * 0.04,
      sizeBase: 0.35 + Math.random() * 0.55,
      twinkleSpeed: 1.2 + Math.random() * 2.8,
      twinklePhase: TAU * Math.random(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }
  return pts;
}

const STATE_PROFILE: Record<
  AuraState,
  { speed: number; breathe: number; glow: number; stream: number; tint: [number, number, number] | null }
> = {
  idle: { speed: 1, breathe: 0.028, glow: 0.06, stream: 0, tint: null },
  thinking: { speed: 2.2, breathe: 0.05, glow: 0.12, stream: 0.35, tint: null },
  tools: { speed: 2.8, breathe: 0.055, glow: 0.14, stream: 0.5, tint: [0, 180, 220] },
  responding: { speed: 1.8, breathe: 0.045, glow: 0.11, stream: 0.65, tint: null },
  recording: { speed: 2.4, breathe: 0.06, glow: 0.13, stream: 0.25, tint: [255, 180, 80] },
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
    function pickState(): AuraState {
      return targetStateRef.current;
    }

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
      targetStateRef.current = recording ? "recording" : pickState() === "recording" ? "idle" : pickState();
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

    const dim = 56;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dim * dpr;
    canvas.height = dim * dpr;
    ctx.scale(dpr, dpr);

    const cx = dim / 2;
    const cy = dim / 2;
    const R = dim * 0.34;
    const coreR = dim * 0.2;
    const pts = makeParticles(90);
    let t = 0;
    let smoothState: AuraState = "idle";

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, dim, dim);
      t += 0.004;

      const target = stateRef.current;
      if (smoothState !== target) smoothState = target;
      const profile = STATE_PROFILE[smoothState];

      const breathe = 1 + profile.breathe * Math.sin(t * (1.6 * profile.speed));
      const pulse = 0.65 + 0.35 * Math.sin(t * (2.2 * profile.speed));

      for (const p of pts) {
        const driftX = p.driftAmp * Math.sin(t * profile.speed + p.drift);
        const driftY = p.driftAmp * Math.cos(t * profile.speed * 0.75 + p.drift * 1.2);
        const theta = p.theta + t * p.speed * profile.speed + driftX;
        const phi = p.phi + driftY * 0.35;

        const sinPhi = Math.sin(phi);
        const x3d = Math.cos(theta) * sinPhi;
        const y3d = Math.cos(phi);
        const z3d = Math.sin(theta) * sinPhi;

        const persp = 1 / (1 - z3d * 0.28);
        const px = cx + x3d * R * p.r * breathe * persp;
        const py = cy + y3d * R * p.r * breathe * persp;

        const depthFactor = (z3d + 1) * 0.5;
        const twinkle = 0.55 + 0.45 * Math.sin(t * p.twinkleSpeed * profile.speed + p.twinklePhase);
        const alpha = (0.05 + depthFactor * p.brightness * 0.75) * twinkle;

        let [cr, cg, cb] = p.color;
        if (profile.tint) {
          const mix = 0.35 + profile.stream * 0.25;
          cr = Math.round(cr * (1 - mix) + profile.tint[0] * mix);
          cg = Math.round(cg * (1 - mix) + profile.tint[1] * mix);
          cb = Math.round(cb * (1 - mix) + profile.tint[2] * mix);
        }

        const dotR = p.sizeBase * (0.35 + depthFactor * 0.65) * 0.55;

        if (depthFactor > 0.55 && alpha > 0.2) {
          ctx.beginPath();
          ctx.arc(px, py, dotR * 2.5, 0, TAU);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.1})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, TAU);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.fill();
      }

      const glowR = coreR * breathe * (1 + profile.stream * 0.15);
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      coreGlow.addColorStop(0, `rgba(0, 212, 245, ${profile.glow * pulse})`);
      coreGlow.addColorStop(0.45, `rgba(0, 212, 245, ${profile.glow * 0.35 * pulse})`);
      coreGlow.addColorStop(1, "rgba(0, 212, 245, 0)");
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, TAU);
      ctx.fillStyle = coreGlow;
      ctx.fill();

      if (profile.stream > 0) {
        const streamCount = 3;
        for (let i = 0; i < streamCount; i++) {
          const angle = t * profile.speed * 1.4 + (i / streamCount) * TAU;
          const ringR = coreR * 0.85 * breathe;
          const arcW = 0.5 + profile.stream * 0.8;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, angle, angle + arcW);
          ctx.strokeStyle = `rgba(0, 212, 245, ${0.08 + profile.stream * 0.12})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <div className="pointer-events-none mb-1 flex h-10 items-center justify-center" aria-hidden>
      <div className="relative" style={{ width: 56, height: 56 }}>
        <canvas ref={canvasRef} className="absolute inset-0" style={{ width: 56, height: 56 }} />
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            top: "28%",
            left: "28%",
            width: "44%",
            height: "44%",
            background:
              "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 30%, rgba(0,212,245,0.05) 58%, transparent 100%)",
            boxShadow: "0 0 28px 8px rgba(0,212,245,0.08), inset 0 -4px 10px rgba(0,0,0,0.35)",
            animation: "axe-orb-breathe 3s ease-in-out infinite",
          }}
        />
        <span
          className="pointer-events-none absolute inset-[-20%] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(0,212,245,0.05) 0%, transparent 65%)",
            animation: "axe-orb-glow 3s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
