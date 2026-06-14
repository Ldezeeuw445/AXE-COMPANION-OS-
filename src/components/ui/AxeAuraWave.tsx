"use client";

import { useEffect, useRef, useState } from "react";

type AuraState = "idle" | "thinking" | "tools" | "responding" | "recording" | "speaking";

const TAU = Math.PI * 2;

interface SphereParticle {
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
  sparkle: boolean;
}

interface SprayParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  brightness: number;
  size: number;
  drift: number;
}

interface AtmoParticle {
  angle: number;
  radius: number;
  speed: number;
  brightness: number;
  drift: number;
  sizeBase: number;
}

type MotionProfile = {
  speed: number;
  breathe: number;
  glow: number;
  stream: number;
  noise: number;
  spin: number;
  twinkle: number;
  scale: number;
};

function makeSphereParticles(count: number, hemisphereOnly = false): SphereParticle[] {
  const pts: SphereParticle[] = [];
  for (let i = 0; i < count; i++) {
    const shell = Math.random();
    const r = shell < 0.28 ? 0.58 + Math.random() * 0.18 : 0.78 + Math.random() * 0.42;
    const phi = hemisphereOnly
      ? Math.acos(1 - Math.random() * 0.5)
      : Math.acos(2 * Math.random() - 1);
    pts.push({
      phi,
      theta: TAU * Math.random(),
      r,
      speed: 0.008 + Math.random() * 0.12,
      brightness: 0.14 + Math.random() * 0.86,
      drift: TAU * Math.random(),
      driftAmp: 0.012 + Math.random() * 0.055,
      sizeBase: 0.16 + Math.random() * 0.48,
      twinkleSpeed: 0.8 + Math.random() * 4,
      twinklePhase: TAU * Math.random(),
      noiseSeed: Math.random() * TAU,
      sparkle: Math.random() < 0.06,
    });
  }
  return pts;
}

function makeSprayParticles(count: number): SprayParticle[] {
  const pts: SprayParticle[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      x: (Math.random() - 0.5) * 1.6,
      y: -0.55 - Math.random() * 0.9,
      vx: (Math.random() - 0.5) * 0.012,
      vy: -0.004 - Math.random() * 0.014,
      brightness: 0.08 + Math.random() * 0.35,
      size: 0.12 + Math.random() * 0.35,
      drift: TAU * Math.random(),
    });
  }
  return pts;
}

function makeAtmoParticles(count: number): AtmoParticle[] {
  const pts: AtmoParticle[] = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      angle: TAU * Math.random(),
      radius: 0.62 + Math.random() * 0.48,
      speed: 0.004 + Math.random() * 0.016,
      brightness: 0.05 + Math.random() * 0.16,
      drift: TAU * Math.random(),
      sizeBase: 0.14 + Math.random() * 0.36,
    });
  }
  return pts;
}

function cyanForElevation(yNorm: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (yNorm + 1) * 0.5));
  return [Math.round(t * 8), Math.round(230 - t * 55), Math.round(255 - t * 25)];
}

function domeColor(yNorm: number, sparkle: boolean): [number, number, number] {
  if (sparkle) return [255, 255, 255];
  const crest = Math.max(0, Math.min(1, (yNorm + 0.15) / 1.15));
  if (crest > 0.72) {
    const mix = (crest - 0.72) / 0.28;
    return [
      Math.round(40 + mix * 20),
      Math.round(170 + mix * 75),
      Math.round(220 + mix * 35),
    ];
  }
  const body = 1 - crest;
  return [
    Math.round(120 + body * 70),
    Math.round(40 + crest * 90),
    Math.round(180 + crest * 60),
  ];
}

const STATE_PROFILE: Record<AuraState, MotionProfile> = {
  idle: { speed: 1, breathe: 0.028, glow: 0.1, stream: 0, noise: 0.1, spin: 0.28, twinkle: 1, scale: 1 },
  thinking: { speed: 3.2, breathe: 0.09, glow: 0.26, stream: 0.55, noise: 0.26, spin: 1.35, twinkle: 1.65, scale: 1.1 },
  tools: { speed: 4.1, breathe: 0.095, glow: 0.3, stream: 0.72, noise: 0.32, spin: 1.55, twinkle: 1.8, scale: 1.12 },
  responding: { speed: 2.6, breathe: 0.085, glow: 0.24, stream: 0.92, noise: 0.2, spin: 1.05, twinkle: 1.5, scale: 1.08 },
  speaking: { speed: 2.1, breathe: 0.11, glow: 0.28, stream: 0.62, noise: 0.17, spin: 0.82, twinkle: 1.35, scale: 1.09 },
  recording: { speed: 3.4, breathe: 0.088, glow: 0.27, stream: 0.48, noise: 0.24, spin: 1.25, twinkle: 1.65, scale: 1.11 },
};

const STATE_BREATHE_SEC: Record<AuraState, number> = {
  idle: 2.8,
  thinking: 1.15,
  tools: 0.95,
  responding: 1.25,
  speaking: 0.78,
  recording: 1.05,
};

const IDLE_PROFILE = STATE_PROFILE.idle;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpProfile(current: MotionProfile, target: MotionProfile, t: number): MotionProfile {
  return {
    speed: lerp(current.speed, target.speed, t),
    breathe: lerp(current.breathe, target.breathe, t),
    glow: lerp(current.glow, target.glow, t),
    stream: lerp(current.stream, target.stream, t),
    noise: lerp(current.noise, target.noise, t),
    spin: lerp(current.spin, target.spin, t),
    twinkle: lerp(current.twinkle, target.twinkle, t),
    scale: lerp(current.scale, target.scale, t),
  };
}

function isPhoneLandscapeViewport(): boolean {
  if (typeof window === "undefined") return false;
  const landscape = window.matchMedia("(orientation: landscape)").matches;
  if (!landscape) return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const short = window.matchMedia("(max-height: 520px)").matches;
  return coarse || short || window.innerHeight < 520;
}

export function AxeAuraWave({ variant = "full" }: { variant?: "full" | "composer" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const stateRef = useRef<AuraState>("idle");
  const tokenPulseRef = useRef(0);
  const smoothProfileRef = useRef<MotionProfile>({ ...IDLE_PROFILE });
  const [state, setState] = useState<AuraState>("idle");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    function onThinking(e: Event) {
      const thinking = (e as CustomEvent<{ thinking?: boolean }>).detail?.thinking;
      if (!thinking) {
        if (stateRef.current !== "recording" && stateRef.current !== "speaking") {
          setState("idle");
        }
        return;
      }
      if (stateRef.current === "recording" || stateRef.current === "speaking") return;
      setState("thinking");
    }

    function onRecording(e: Event) {
      const recording = (e as CustomEvent<{ recording?: boolean }>).detail?.recording;
      setState(recording ? "recording" : "idle");
    }

    function onSpeaking(e: Event) {
      const speaking = (e as CustomEvent<{ speaking?: boolean }>).detail?.speaking;
      if (speaking) {
        setState("speaking");
        return;
      }
      if (stateRef.current === "speaking") setState("idle");
    }

    function onStreamStatus(e: Event) {
      const phase = (e as CustomEvent<{ phase?: string }>).detail?.phase;
      if (stateRef.current === "recording" || stateRef.current === "speaking") return;
      if (phase === "tools") setState("tools");
      else if (phase === "responding") setState("responding");
      else if (phase === "thinking") setState("thinking");
    }

    function onStreamToken() {
      if (stateRef.current === "recording" || stateRef.current === "speaking") return;
      tokenPulseRef.current = 1;
      setState("responding");
    }

    window.addEventListener("axe:thinking", onThinking);
    window.addEventListener("axe:recording", onRecording);
    window.addEventListener("axe:speaking", onSpeaking);
    window.addEventListener("axe:stream-status", onStreamStatus);
    window.addEventListener("axe:stream-token", onStreamToken);
    return () => {
      window.removeEventListener("axe:thinking", onThinking);
      window.removeEventListener("axe:recording", onRecording);
      window.removeEventListener("axe:speaking", onSpeaking);
      window.removeEventListener("axe:stream-status", onStreamStatus);
      window.removeEventListener("axe:stream-token", onStreamToken);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isComposer = variant === "composer";
    const dim = isComposer ? { w: 280, h: 128 } : { w: 104, h: 104 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dim.w * dpr;
    canvas.height = dim.h * dpr;
    ctx.scale(dpr, dpr);

    const cx = dim.w / 2;
    const cy = isComposer ? dim.h - 2 : dim.h / 2;
    const R = (isComposer ? dim.w : dim.w) * (isComposer ? 0.34 : 0.36);
    const coreR = dim.w * (isComposer ? 0.22 : 0.24);
    const atmoR = dim.w * (isComposer ? 0.46 : 0.52);
    const spherePts = makeSphereParticles(isComposer ? 920 : 820, isComposer);
    const sprayPts = isComposer ? makeSprayParticles(140) : [];
    const atmoPts = isComposer ? [] : makeAtmoParticles(150);
    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, dim.w, dim.h);
      t += 0.005;

      const target = STATE_PROFILE[stateRef.current];
      smoothProfileRef.current = lerpProfile(smoothProfileRef.current, target, 0.09);
      const profile = smoothProfileRef.current;

      tokenPulseRef.current *= 0.86;
      const tokenBoost = tokenPulseRef.current * 2.4;
      const activeSpeed = profile.speed + tokenBoost;
      const activeSpin = profile.spin + tokenBoost * 0.35;
      const activeNoise = profile.noise + tokenBoost * 0.12;

      const breathe =
        1 +
        profile.breathe *
          profile.scale *
          (Math.sin(t * (1.4 * activeSpeed)) +
            (stateRef.current === "responding" || stateRef.current === "speaking"
              ? 0.35 * Math.sin(t * (5.5 * activeSpeed))
              : 0));
      const pulse = 0.55 + 0.45 * Math.sin(t * (2.2 * activeSpeed));
      const globalSpin = t * activeSpin;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      if (isComposer) {
        for (const p of sprayPts) {
          const wobble = 0.08 * Math.sin(t * 1.6 + p.drift);
          const px = cx + (p.x + wobble) * R * profile.scale;
          const py = cy + (p.y + Math.sin(t * 0.7 + p.drift) * 0.06) * R * profile.scale;
          if (py > cy + 2) continue;
          const tw = 0.35 + 0.65 * Math.sin(t * 2.4 + p.drift);
          const alpha = p.brightness * tw * (0.35 + profile.glow);
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, TAU);
          ctx.fillStyle = `rgba(0, 212, 245, ${alpha})`;
          ctx.fill();
        }
      } else {
        for (const p of atmoPts) {
          const wobble = 0.04 * Math.sin(t * 0.9 + p.drift);
          const angle = p.angle + t * p.speed * activeSpeed + wobble;
          const r = atmoR * p.radius * profile.scale;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          const tw = 0.45 + 0.55 * Math.sin(t * 1.4 + p.drift);
          const alpha = p.brightness * tw * (0.5 + profile.glow);
          ctx.beginPath();
          ctx.arc(px, py, p.sizeBase * 0.55, 0, TAU);
          ctx.fillStyle = `rgba(0, 212, 245, ${alpha})`;
          ctx.fill();
        }
      }

      const sorted = spherePts
        .map((p) => {
          const driftX = p.driftAmp * Math.sin(t * activeSpeed * 1.15 + p.drift);
          const driftY = p.driftAmp * Math.cos(t * activeSpeed * 0.88 + p.drift * 1.25);
          const theta = p.theta + globalSpin + t * p.speed * activeSpeed + driftX;
          const phi = p.phi + driftY * 0.42;

          const surfaceNoise =
            1 +
            activeNoise *
              (Math.sin(theta * 3 + t * 1.7 + p.noiseSeed) * 0.48 +
                Math.cos(phi * 4 - t * 1.25 + p.noiseSeed * 1.6) * 0.38 +
                Math.sin((theta + phi) * 2 + t * 2.3) * 0.22);

          const sinPhi = Math.sin(phi);
          const x3d = Math.cos(theta) * sinPhi;
          const y3d = Math.cos(phi);
          const z3d = Math.sin(theta) * sinPhi;

          const persp = 1 / (1 - z3d * 0.3);
          const radius = R * p.r * breathe * surfaceNoise * persp * profile.scale;
          return {
            p,
            px: cx + x3d * radius,
            py: cy - y3d * radius,
            y3d,
            z3d,
          };
        })
        .filter((item) => !isComposer || item.py <= cy + 1)
        .sort((a, b) => a.z3d - b.z3d);

      for (const item of sorted) {
        const { p, px, py, z3d } = item;
        const depthFactor = (z3d + 1) * 0.5;
        const twinkle =
          0.45 +
          0.55 * Math.sin(t * p.twinkleSpeed * profile.twinkle * activeSpeed + p.twinklePhase);
        const alpha = (0.18 + depthFactor * p.brightness * 0.95) * twinkle;
        const [cr, cg, cb] = isComposer
          ? domeColor(item.y3d, p.sparkle)
          : cyanForElevation(item.y3d);
        const dotR = p.sizeBase * (0.28 + depthFactor * 0.72) * (isComposer ? 0.42 : 0.48);

        if (!isComposer && depthFactor > 0.48 && alpha > 0.1) {
          ctx.beginPath();
          ctx.arc(px, py, dotR * 2.8, 0, TAU);
          ctx.fillStyle = `rgba(0, 212, 245, ${alpha * 0.16})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, TAU);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${Math.min(1, alpha * 1.1)})`;
        ctx.fill();
      }

      ctx.restore();

      if (!isComposer) {
        const glowR = coreR * breathe * (1 + profile.stream * 0.25);
        const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        coreGlow.addColorStop(0, `rgba(0, 224, 255, ${profile.glow * pulse * 1})`);
        coreGlow.addColorStop(0.35, `rgba(0, 212, 245, ${profile.glow * pulse * 0.7})`);
        coreGlow.addColorStop(0.72, `rgba(0, 180, 220, ${profile.glow * pulse * 0.3})`);
        coreGlow.addColorStop(1, "rgba(0, 160, 200, 0)");
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, TAU);
        ctx.fillStyle = coreGlow;
        ctx.fill();

        if (profile.stream > 0.05) {
          const arcs = stateRef.current === "tools" ? 6 : stateRef.current === "responding" ? 5 : 4;
          for (let i = 0; i < arcs; i++) {
            const angle = t * activeSpeed * 1.7 + (i / arcs) * TAU;
            const ringR = coreR * (0.7 + i * 0.07) * breathe;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, angle, angle + 0.35 + profile.stream * 0.9);
            ctx.strokeStyle = `rgba(0, 224, 255, ${0.07 + profile.stream * 0.18})`;
            ctx.lineWidth = 0.6 + profile.stream * 0.45;
            ctx.stroke();
          }
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [variant]);

  const breatheSec = STATE_BREATHE_SEC[state];
  const displaySize = variant === "composer" ? { w: 280, h: 128 } : { w: 104, h: 104 };

  if (variant === "composer") {
    return (
      <canvas
        ref={canvasRef}
        className="pointer-events-none block"
        style={{
          width: displaySize.w,
          height: displaySize.h,
          background: "transparent",
          filter: "drop-shadow(0 0 18px rgba(0, 212, 245, 0.35))",
        }}
        aria-hidden
      />
    );
  }

  return (
    <div className="pointer-events-none mb-0.5 flex h-16 items-center justify-center" aria-hidden>
      <div className="relative" style={{ width: displaySize.w, height: displaySize.h }}>
        <canvas ref={canvasRef} className="absolute inset-0" style={{ width: displaySize.w, height: displaySize.h }} />
        <span
          className="pointer-events-none absolute rounded-full transition-[animation-duration] duration-500"
          style={{
            top: "26%",
            left: "26%",
            width: "48%",
            height: "48%",
            background:
              "radial-gradient(circle at 38% 32%, rgba(0,224,255,0.24) 0%, rgba(0,212,245,0.14) 35%, rgba(0,180,220,0.07) 62%, transparent 100%)",
            boxShadow:
              "0 0 44px 16px rgba(0,212,245,0.24), 0 0 88px 28px rgba(0,212,245,0.1), inset 0 -4px 10px rgba(0,100,140,0.4)",
            animation: `axe-orb-breathe ${breatheSec}s ease-in-out infinite`,
          }}
        />
        <span
          className="pointer-events-none absolute inset-[-32%] rounded-full transition-[animation-duration] duration-500"
          style={{
            background:
              "radial-gradient(circle, rgba(0,212,245,0.16) 0%, rgba(0,212,245,0.06) 42%, transparent 72%)",
            animation: `axe-orb-glow ${breatheSec}s ease-in-out infinite`,
          }}
        />
      </div>
    </div>
  );
}

export { isPhoneLandscapeViewport };
