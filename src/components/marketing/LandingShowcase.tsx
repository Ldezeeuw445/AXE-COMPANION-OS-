"use client";

/**
 * LandingShowcase
 *
 * Linear/Huly-style interactive product showcase built from the REAL
 * AXE Companion app screenshots in /public/landing/photos. A row of
 * labelled tabs swaps the large framed device shot with a soft cross-fade
 * and a cyan glow. Auto-advances, pauses on manual selection and hover.
 *
 * Every image here is an actual screen capture of the shipping app, so
 * the showcase doubles as honest proof, not a marketing illustration.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Activity, BarChart2, Brain, LineChart, ListChecks, Radio } from "lucide-react";

type Shot = {
  id: string;
  label: string;
  caption: string;
  src: string;
  Icon: typeof LineChart;
};

const SHOTS: Shot[] = [
  {
    id: "chart",
    label: "Live chart",
    caption:
      "BTCUSD H1 with structure — BOS / SFP labels, PDH, swing highs/lows and an order block that extends until mitigated. Real Lightweight Charts on MT5 ticks.",
    src: "/landing/photos/809_1x_shots_so.png",
    Icon: LineChart,
  },
  {
    id: "axe",
    label: "AXE intel",
    caption:
      "Ask AXE for an XAUUSD read — bias, key levels, outlook and action points, with your active pair and account pinned as context.",
    src: "/landing/photos/595_1x_shots_so.png",
    Icon: Brain,
  },
  {
    id: "quotes",
    label: "Quotes",
    caption:
      "Live bid / ask / spread across XAU, indices, crypto and FX — straight from your broker feed, color-split cyan bid and rose ask.",
    src: "/landing/photos/338_1x_shots_so.png",
    Icon: BarChart2,
  },
  {
    id: "tools",
    label: "Chart tools",
    caption:
      "The full chart toolset one tap away — Auto-Fib, Auto-Trend, Structure, OB / FVG / iFVG, PDH/PDL, plus VOL, MA, MACD, RSI, VWAP and POC.",
    src: "/landing/photos/569_1x_shots_so.png",
    Icon: Activity,
  },
  {
    id: "actions",
    label: "Quick actions",
    caption:
      "One-tap workflows — next high-impact news, today's macro risk, what matters for your pair — execution stays disabled by default.",
    src: "/landing/photos/873_1x_shots_so.png",
    Icon: ListChecks,
  },
  {
    id: "intel",
    label: "Global intel",
    caption:
      "Smart-money context like global chokepoints — Hormuz, Malacca, Suez — graded by severity and live ship/trade flow.",
    src: "/landing/photos/688_1x_shots_so.png",
    Icon: Radio,
  },
];

const ADVANCE_MS = 4800;

export function LandingShowcase() {
  const [active, setActive] = useState(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setActive((i) => (i + 1) % SHOTS.length);
    }, ADVANCE_MS);
    return () => clearInterval(interval);
  }, []);

  const pick = useCallback((index: number) => {
    pausedUntil.current = Date.now() + 9000;
    setActive(index);
  }, []);

  return (
    <div
      className="grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]"
      onMouseEnter={() => {
        pausedUntil.current = Date.now() + 60_000;
      }}
      onMouseLeave={() => {
        pausedUntil.current = Date.now() + 1500;
      }}
    >
      {/* Tab list / captions */}
      <div className="order-2 lg:order-1">
        <div className="flex flex-col gap-2">
          {SHOTS.map((shot, index) => {
            const isActive = index === active;
            const Icon = shot.Icon;
            return (
              <button
                key={shot.id}
                type="button"
                onClick={() => pick(index)}
                aria-pressed={isActive}
                className={`group relative flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-cyan-300/35 bg-cyan-400/[0.06] shadow-[0_0_36px_-18px_rgba(34,211,238,0.55)]"
                    : "border-white/[0.06] bg-white/[0.015] hover:border-white/12 hover:bg-white/[0.03]"
                }`}
              >
                {/* active accent bar */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-full transition ${
                    isActive ? "bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]" : "bg-transparent"
                  }`}
                />
                <span
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition ${
                    isActive
                      ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-tos-muted group-hover:text-cyan-200/90"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-semibold transition ${
                      isActive ? "text-white" : "text-white/80"
                    }`}
                  >
                    {shot.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-[12.5px] leading-snug transition ${
                      isActive ? "text-tos-muted" : "text-tos-dim group-hover:text-tos-muted"
                    }`}
                  >
                    {shot.caption}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Device frame with the real screenshot */}
      <div className="order-1 flex justify-center lg:order-2">
        <div className="relative">
          {/* glow halo */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-10 rounded-[3rem]"
            style={{
              background:
                "radial-gradient(ellipse at 50% 35%, rgba(34,211,238,0.20) 0%, rgba(34,211,238,0.06) 38%, transparent 68%)",
              filter: "blur(40px)",
            }}
          />
          <div className="axe-device-shot relative w-[290px] p-3 sm:w-[320px]">
            {/* notch */}
            <div
              aria-hidden
              className="absolute left-1/2 top-3 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black/90"
            />
            <div className="relative aspect-[1080/1080] w-full overflow-hidden rounded-[1.5rem] bg-black">
              {SHOTS.map((shot, index) => (
                <Image
                  key={shot.id}
                  src={shot.src || "/placeholder.svg"}
                  alt={`AXE Companion — ${shot.label}`}
                  fill
                  sizes="320px"
                  priority={index === 0}
                  className={`object-cover object-top transition-opacity duration-700 ${
                    index === active ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* live chip */}
          <div className="absolute -right-3 bottom-10 z-20 flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-[#04070c]/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300" />
            </span>
            Real app
          </div>
        </div>
      </div>
    </div>
  );
}
