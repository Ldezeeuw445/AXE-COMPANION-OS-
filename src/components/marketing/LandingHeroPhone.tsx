"use client";

/**
 * LandingHeroPhone
 *
 * Premium interactive phone mock for the AXE Companion landing page.
 * Auto-cycles through five real-app screens (Chart → Depth → News →
 * Execution → AXE chat) with subtle live motion: ticking candles,
 * flashing inside-spread rows, headlines fading in, BUY pulse, AXE
 * thinking dots. The user can also tap the segmented bar at the bottom
 * to jump to any screen — same interaction model as the real app's
 * top-bar drawers.
 *
 * Visual language follows the Trading OS dark + cyan aesthetic the
 * rest of the app uses: deep #04070C frame, cyan glow halo, rose for
 * sells, teal/cyan for buys, monospace prices.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  BarChart2,
  ChevronDown,
  Crosshair,
  Menu,
  MessageSquare,
  Newspaper,
  Settings2,
  Sparkles,
  Target,
} from "lucide-react";

const FRAMES = [
  { id: "chart", label: "Chart" },
  { id: "depth", label: "Depth" },
  { id: "news", label: "News" },
  { id: "exec", label: "Execute" },
  { id: "axe", label: "AXE" },
] as const;

type FrameId = (typeof FRAMES)[number]["id"];

const FRAME_DURATION_MS = 4_200;
const TICK_MS = 1_200;

export function LandingHeroPhone() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [tickSeed, setTickSeed] = useState(0);
  const userPickedRef = useRef<number>(0);

  // Auto-advance through the frames. Pause briefly when the user
  // manually picks a frame so they can inspect it without flicker —
  // we resume after ~6s of idle.
  useEffect(() => {
    const interval = setInterval(() => {
      const sinceUserPick = Date.now() - userPickedRef.current;
      if (sinceUserPick < 5_500) return;
      setActiveIndex((idx) => (idx + 1) % FRAMES.length);
    }, FRAME_DURATION_MS);
    return () => clearInterval(interval);
  }, []);

  // Lightweight tick clock that drives micro-animations (candle close,
  // depth flash, headline rotate, AXE typing dots). Runs even when
  // not visible — cost is negligible and keeps the panel feeling
  // alive when the user scrolls back to it.
  useEffect(() => {
    const interval = setInterval(() => setTickSeed((seed) => seed + 1), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const handlePick = useCallback((index: number) => {
    userPickedRef.current = Date.now();
    setActiveIndex(index);
  }, []);

  const activeId: FrameId = FRAMES[activeIndex].id;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Cyan halo behind the phone — intensifies on hover */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-12 rounded-[3rem] transition-opacity duration-500 ${
          isHovered ? "opacity-90" : "opacity-55"
        }`}
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(34,211,238,0.22) 0%, rgba(34,211,238,0.08) 32%, transparent 64%)",
          filter: "blur(36px)",
        }}
      />

      {/* Hairline aurora streaks at the top of the phone — Trading OS
          has these around the chart toolbar; reusing them here makes
          the landing feel like a live app screenshot. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-y-2 left-1/2 h-2 w-[58%] -translate-x-1/2 rounded-full transition-opacity duration-500 ${
          isHovered ? "opacity-95" : "opacity-65"
        }`}
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.55) 50%, transparent 100%)",
          filter: "blur(8px)",
        }}
      />

      {/* Phone bezel with subtle hover-tilt */}
      <div
        className={`relative rounded-[2.65rem] border border-white/[0.10] bg-gradient-to-b from-[#0E1218] to-[#04070C] p-[5px] shadow-[0_44px_120px_-30px_rgba(0,0,0,0.8),0_18px_36px_-14px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.10)] transition-all duration-500 ease-out`}
        style={{
          transform: `perspective(1500px) ${
            isHovered ? "rotateY(-4deg) rotateX(2deg) translateY(-4px)" : "rotateY(-7deg) rotateX(2.5deg)"
          }`,
        }}
      >
        {/* Glossy top reflection */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-1 h-[40%] rounded-[2.4rem]"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.0) 100%)",
            mixBlendMode: "screen",
          }}
        />

        {/* Inner display */}
        <div className="relative h-[640px] w-[300px] overflow-hidden rounded-[2.35rem] bg-[#030810]">
          {/* Status bar (iOS-style) */}
          <div className="flex h-9 items-center justify-between bg-black px-5 font-mono text-[11px] font-semibold text-white/80">
            <span>09:41</span>
            <span className="h-3 w-[58px] rounded-full bg-black" aria-hidden />
            <span className="text-white/55">5G · 87%</span>
          </div>

          {/* App top-bar — same shape as the real ChartScreen top-bar:
              menu / 4 cyan circular icons / AXE wordmark */}
          <div className="flex h-[44px] items-center justify-between border-b border-white/[0.05] bg-black/85 px-3">
            <button
              type="button"
              aria-label="Menu"
              className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-tos-muted"
            >
              <Menu className="h-3.5 w-3.5" aria-hidden />
            </button>
            <div className="flex items-center gap-1.5">
              <ToolButton
                icon={<BarChart2 className="h-3 w-3" />}
                active={activeId === "depth"}
                onClick={() => handlePick(1)}
                label="Depth"
              />
              <ToolButton
                icon={<Newspaper className="h-3 w-3" />}
                active={activeId === "news"}
                onClick={() => handlePick(2)}
                label="News"
              />
              <ToolButton
                icon={<Crosshair className="h-3 w-3" />}
                active={false}
                onClick={() => handlePick(0)}
                label="Indicators"
              />
              <ToolButton
                icon={<Settings2 className="h-3 w-3" />}
                active={false}
                onClick={() => handlePick(0)}
                label="Settings"
              />
            </div>
            <button
              type="button"
              aria-label="AXE"
              onClick={() => handlePick(4)}
              className={`grid h-7 w-7 place-items-center rounded-lg border bg-black transition ${
                activeId === "axe"
                  ? "border-cyan-300/70 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                  : "border-cyan-300/20"
              }`}
            >
              <Image
                src="/axe-icon.png"
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
            </button>
          </div>

          {/* Frame slot — the real-feeling content */}
          <div className="relative h-[calc(640px-9px-44px-44px-30px)]">
            {activeId === "chart" ? <ChartFrame seed={tickSeed} /> : null}
            {activeId === "depth" ? <DepthFrame seed={tickSeed} /> : null}
            {activeId === "news" ? <NewsFrame seed={tickSeed} /> : null}
            {activeId === "exec" ? <ExecFrame seed={tickSeed} /> : null}
            {activeId === "axe" ? <AxeFrame seed={tickSeed} /> : null}
          </div>

          {/* Execution dock — present on all chart-style frames so the
              landing reads "this is a real trading app", not a marketing
              illustration. The colors flash when the Execute frame is
              active, exactly like the real app. */}
          <ExecDock active={activeId === "exec"} seed={tickSeed} />

          {/* Frame indicator strip — also acts as a tap selector */}
          <div className="absolute inset-x-0 bottom-0 flex h-[30px] items-center justify-center gap-1.5 bg-black/95 px-2">
            {FRAMES.map((frame, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => handlePick(index)}
                  className={`group flex items-center gap-1 rounded-full px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.18em] transition ${
                    isActive
                      ? "bg-cyan-400/14 text-cyan-100"
                      : "text-tos-dim hover:text-cyan-200"
                  }`}
                  aria-label={`Show ${frame.label}`}
                  aria-pressed={isActive}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full transition ${
                      isActive ? "bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.7)]" : "bg-white/20"
                    }`}
                    aria-hidden
                  />
                  {frame.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Soft ground reflection (only really visible on dark bg) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 left-1/2 h-24 w-[78%] -translate-x-1/2 rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(34,211,238,0.16) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />
    </div>
  );
}

function ToolButton({
  icon,
  active,
  onClick,
  label,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-full border bg-black/72 text-cyan-200 backdrop-blur transition ${
        active
          ? "border-cyan-300/60 bg-cyan-400/14 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.4)]"
          : "border-cyan-400/30 hover:border-cyan-300/50"
      }`}
    >
      {icon}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
//   FRAMES
// ──────────────────────────────────────────────────────────────────────────────

function ChartFrame({ seed }: { seed: number }) {
  // Deterministic candles that subtly shift each tick so the chart
  // looks alive without ever spiking randomly.
  const candles = useMemo(() => {
    const arr = [] as Array<{ x: number; open: number; close: number; high: number; low: number; up: boolean }>;
    let close = 4708.5;
    for (let i = 0; i < 22; i += 1) {
      const drift = Math.sin((i + seed * 0.6) * 0.42) * 6;
      const wick = Math.abs(Math.cos((i + seed * 0.5) * 0.7)) * 4;
      const open = close;
      close = close + drift;
      const up = close >= open;
      arr.push({
        x: 12 + i * 12,
        open,
        close,
        high: Math.max(open, close) + wick,
        low: Math.min(open, close) - wick,
        up,
      });
    }
    return arr;
  }, [seed]);

  const last = candles[candles.length - 1];

  // Simple price-to-y mapping inside our 250px tall plot area.
  const minLow = Math.min(...candles.map((c) => c.low));
  const maxHigh = Math.max(...candles.map((c) => c.high));
  const range = Math.max(maxHigh - minLow, 1);
  const toY = (price: number) => 18 + ((maxHigh - price) / range) * 220;

  return (
    <div className="relative h-full bg-[#030810]">
      {/* Symbol header */}
      <div className="absolute left-3 top-2 z-10">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[12px] font-bold uppercase tracking-tight text-[#1f8cff]">
            XAUUSD
          </span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-1 font-mono text-[9px] font-semibold text-tos-muted">
            H1
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-tos-text/85">
          {last.close.toFixed(2)}
        </div>
      </div>

      {/* Status pill */}
      <div className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-emerald-200/95">
        <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-300" aria-hidden />
        Live
      </div>

      {/* Grid + price scale + path */}
      <svg
        className="absolute inset-0"
        width="300"
        height="100%"
        viewBox="0 0 300 256"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* Subtle grid */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={`h-${i}`}
            x1="0"
            x2="270"
            y1={32 + i * 48}
            y2={32 + i * 48}
            stroke="rgba(110,170,200,0.05)"
            strokeWidth="1"
          />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line
            key={`v-${i}`}
            x1={i * 50}
            x2={i * 50}
            y1="0"
            y2="256"
            stroke="rgba(110,170,200,0.04)"
            strokeWidth="1"
          />
        ))}

        {/* Right price axis labels */}
        {[
          { y: 30, p: maxHigh },
          { y: 80, p: maxHigh - range * 0.25 },
          { y: 130, p: maxHigh - range * 0.5 },
          { y: 180, p: maxHigh - range * 0.75 },
          { y: 230, p: minLow },
        ].map((tick) => (
          <text
            key={tick.y}
            x="272"
            y={tick.y}
            fill="rgba(208,220,234,0.55)"
            fontSize="8.5"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {tick.p.toFixed(2)}
          </text>
        ))}

        {/* Auto-Fib levels — teal / blue / gold like the real component */}
        {[
          { ratio: 0, color: "rgba(45,212,191,0.7)", label: "0%" },
          { ratio: 0.382, color: "rgba(45,212,191,0.55)", label: "38.2%" },
          { ratio: 0.5, color: "rgba(96,165,250,0.7)", label: "50%" },
          { ratio: 0.618, color: "rgba(245,191,99,0.75)", label: "61.8%" },
          { ratio: 1, color: "rgba(45,212,191,0.7)", label: "100%" },
        ].map((level, i) => {
          const y = 50 + level.ratio * 160;
          return (
            <g key={i}>
              <line
                x1="14"
                x2="262"
                y1={y}
                y2={y}
                stroke={level.color}
                strokeDasharray="2 5"
                strokeWidth="1"
              />
              <text
                x="262"
                y={y - 2}
                textAnchor="end"
                fill={level.color}
                fontSize="7.5"
                fontFamily="ui-sans-serif, system-ui"
                fontWeight="600"
              >
                {level.label}
              </text>
            </g>
          );
        })}

        {/* Candles */}
        {candles.map((c, i) => {
          const color = c.up ? "#1F9C7B" : "#C95450";
          const yHigh = toY(c.high);
          const yLow = toY(c.low);
          const yOpen = toY(c.open);
          const yClose = toY(c.close);
          const top = Math.min(yOpen, yClose);
          const bodyH = Math.max(1.5, Math.abs(yOpen - yClose));
          return (
            <g key={i}>
              <line
                x1={c.x + 3.5}
                x2={c.x + 3.5}
                y1={yHigh}
                y2={yLow}
                stroke={color}
                strokeOpacity="0.85"
                strokeWidth="1"
              />
              <rect x={c.x} y={top} width="7" height={bodyH} rx="1" fill={color} opacity="0.95" />
            </g>
          );
        })}

        {/* Live price line */}
        <line
          x1="0"
          x2="270"
          y1={toY(last.close)}
          y2={toY(last.close)}
          stroke="rgba(168,180,196,0.55)"
          strokeDasharray="2 4"
        />
        <rect
          x="244"
          y={toY(last.close) - 8}
          width="48"
          height="14"
          rx="2"
          fill="rgba(34,211,238,0.95)"
        />
        <text
          x="268"
          y={toY(last.close) + 2}
          textAnchor="middle"
          fill="#04161B"
          fontSize="9"
          fontWeight="700"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {last.close.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}

function DepthFrame({ seed }: { seed: number }) {
  // Live-ish synthetic levels around the same XAUUSD mid we use for chart.
  const mid = 4708.5 + Math.sin(seed * 0.5) * 0.4;
  const levels = useMemo(() => {
    const bids = [] as Array<{ price: number; size: string; flash: boolean }>;
    const asks = [] as Array<{ price: number; size: string; flash: boolean }>;
    for (let i = 0; i < 8; i += 1) {
      const sz = (4.2 - i * 0.32 + Math.abs(Math.sin((i + seed) * 1.3)) * 0.7).toFixed(2);
      bids.push({ price: mid - 0.05 - i * 0.05, size: sz, flash: i === 0 && seed % 2 === 0 });
      asks.push({ price: mid + 0.05 + i * 0.05, size: sz, flash: i === 0 && seed % 2 === 1 });
    }
    return { bids, asks };
  }, [mid, seed]);

  return (
    <div className="relative h-full bg-[#030810]">
      {/* The drawer sliding in over a faint chart silhouette */}
      <div className="absolute inset-0 opacity-25">
        <ChartFrame seed={seed - 1} />
      </div>
      <div className="absolute inset-0 bg-[#08080a]/80" aria-hidden />

      <aside className="absolute inset-y-0 left-0 flex w-[88%] flex-col border-r border-white/10 bg-[#030810]/96 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
              <BarChart2 className="h-3 w-3 text-cyan-200" aria-hidden />
            </span>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-tos-text">
                XAUUSD · Depth
              </p>
              <p className="text-[8px] uppercase tracking-[0.2em] text-tos-dim">
                Synthetic · live spread
              </p>
            </div>
          </div>
          <span className="text-[9px] font-semibold text-tos-dim">{mid.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-[1fr_50px_50px_1fr] items-center gap-1 border-b border-white/[0.04] bg-white/[0.015] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-tos-dim">
          <span>Cum</span>
          <span className="text-right text-rose-200/80">Ask</span>
          <span className="text-left text-cyan-200/80">Bid</span>
          <span className="text-right">Cum</span>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col">
            {levels.asks.slice().reverse().map((row, i) => {
              const isInner = i === levels.asks.length - 1;
              return (
                <div
                  key={`a-${i}`}
                  className={`relative grid grid-cols-[1fr_50px_50px_1fr] items-center gap-1 px-2 ${
                    isInner ? "bg-rose-500/[0.07]" : ""
                  } ${row.flash ? "bg-rose-500/[0.12]" : ""}`}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-1/2 origin-right bg-rose-500/[0.08]"
                    style={{ width: `${(8 - i) * 5}%` }}
                  />
                  <span className="relative font-mono text-[8.5px] text-tos-dim">{(8 - i).toFixed(1)}</span>
                  <span className="relative text-right font-mono text-[9.5px] font-semibold text-rose-300/95">
                    {row.price.toFixed(2)}
                  </span>
                  <span className="relative text-left font-mono text-[9.5px] text-tos-muted">{row.size}</span>
                  <span className="relative text-right font-mono text-[8px] text-tos-dim">
                    {isInner ? "L1" : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-y border-cyan-400/15 bg-cyan-400/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-100/85">
            <span>{seed % 2 === 0 ? "↑ Uptick" : "↓ Downtick"}</span>
            <span className="font-mono text-[10px] text-cyan-100">{mid.toFixed(2)}</span>
            <span>0.5p</span>
          </div>
          <div className="flex flex-1 flex-col">
            {levels.bids.map((row, i) => {
              const isInner = i === 0;
              return (
                <div
                  key={`b-${i}`}
                  className={`relative grid grid-cols-[1fr_50px_50px_1fr] items-center gap-1 px-2 ${
                    isInner ? "bg-cyan-500/[0.07]" : ""
                  } ${row.flash ? "bg-cyan-500/[0.12]" : ""}`}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-1/2 origin-left bg-cyan-500/[0.08]"
                    style={{ width: `${(8 - i) * 5}%` }}
                  />
                  <span className="relative font-mono text-[8.5px] text-tos-dim">{(8 - i).toFixed(1)}</span>
                  <span className="relative text-right font-mono text-[9.5px] text-tos-muted">{row.size}</span>
                  <span className="relative text-left font-mono text-[9.5px] font-semibold text-cyan-200/95">
                    {row.price.toFixed(2)}
                  </span>
                  <span className="relative text-right font-mono text-[8px] text-tos-dim">
                    {isInner ? "L1" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

function NewsFrame({ seed }: { seed: number }) {
  const items = useMemo(
    () => [
      {
        source: "Polygon",
        time: "2m ago",
        title: "Fed signals patient stance as inflation eases",
        summary: "Rate-cut path narrows after softer CPI print, traders pricing fewer cuts in Q3.",
        sentiment: "pos" as const,
      },
      {
        source: "Perigon",
        time: "11m ago",
        title: "Dollar firms as risk appetite cools into NY open",
        summary: "DXY back above 104 with EURUSD slipping below the prior session low.",
        sentiment: "neg" as const,
      },
      {
        source: "Finnhub",
        time: "26m ago",
        title: "Gold consolidates after touching record above $4,710",
        summary: "Spot bid by central-bank flows; ETF holdings tick higher for a fourth straight week.",
        sentiment: "pos" as const,
      },
      {
        source: "Polygon",
        time: "44m ago",
        title: "Treasury yields drift higher ahead of 10Y auction",
        summary: "Real-yield differential favors gold longs into the Asia close.",
        sentiment: "neutral" as const,
      },
    ],
    [],
  );

  const reveal = (seed % 4) + 1;

  return (
    <div className="relative h-full bg-[#030810]">
      <div className="absolute inset-0 opacity-25">
        <ChartFrame seed={seed - 2} />
      </div>
      <div className="absolute inset-0 bg-[#08080a]/80" aria-hidden />

      <aside className="absolute inset-y-0 left-0 flex w-[92%] flex-col border-r border-white/10 bg-[#030810]/96 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
              <Newspaper className="h-3 w-3 text-cyan-200" aria-hidden />
            </span>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-tos-text">
                XAUUSD · News
              </p>
              <p className="text-[8px] uppercase tracking-[0.2em] text-tos-dim">
                Cached 5 min · paid feeds first
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.05] px-3 py-1.5">
          {[
            { l: "Polygon", live: true },
            { l: "Perigon", live: true },
            { l: "Finnhub", live: true },
            { l: "EODHD", live: false },
          ].map((p) => (
            <span
              key={p.l}
              className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${
                p.live
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200/95"
                  : "border-white/10 bg-white/[0.03] text-tos-dim"
              }`}
            >
              {p.l}
              {p.live ? "" : " · off"}
            </span>
          ))}
          <span className="ml-auto text-[8px] uppercase tracking-wider text-tos-dim">just now</span>
        </div>
        <ul className="flex-1 divide-y divide-white/[0.04] overflow-hidden">
          {items.slice(0, reveal).map((item, i) => {
            const dotClass =
              item.sentiment === "pos"
                ? "bg-cyan-300"
                : item.sentiment === "neg"
                  ? "bg-rose-300"
                  : "bg-white/35";
            return (
              <li
                key={i}
                className="px-3 py-2 transition-opacity duration-300"
                style={{ opacity: 1 }}
              >
                <div className="flex items-center justify-between gap-2 text-[8px] uppercase tracking-wider text-tos-dim">
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
                    {item.source}
                  </span>
                  <span className="font-mono text-[8px]">{item.time}</span>
                </div>
                <p className="mt-0.5 text-[10.5px] font-semibold leading-snug text-tos-text">
                  {item.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-tos-muted">
                  {item.summary}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-white/[0.05] px-3 py-1.5">
          <div className="flex items-center justify-between rounded-lg border border-cyan-400/22 bg-cyan-400/8 px-2 py-1.5 text-[9px] font-semibold text-cyan-100/95">
            <span className="flex items-center gap-1.5">
              <Target className="h-2.5 w-2.5 text-cyan-300" aria-hidden />
              Smart-money intel for XAUUSD
            </span>
            <span className="text-[8px] text-cyan-300/85">→</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ExecFrame({ seed }: { seed: number }) {
  // Show the chart in the back with a draggable plan overlay (BUY ticket).
  const flash = seed % 2 === 0;
  return (
    <div className="relative h-full bg-[#030810]">
      <ChartFrame seed={seed} />

      {/* Plan lines: limit + SL + TP */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <svg width="300" height="100%" viewBox="0 0 300 256" className="absolute inset-0" aria-hidden>
          {/* Limit line */}
          <line x1="56" x2="248" y1="118" y2="118" stroke="#22D3EE" strokeWidth="1" />
          <rect x="6" y="109" width="46" height="18" rx="3" fill="rgba(0,0,0,0.78)" stroke="#22D3EE" />
          <text
            x="29"
            y="121"
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui"
            fill="#22D3EE"
          >
            BUY LIMIT
          </text>
          <rect x="244" y="109" width="52" height="18" rx="3" fill="rgba(0,0,0,0.85)" stroke="#22D3EE" />
          <text
            x="270"
            y="121"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="#22D3EE"
          >
            4708.20
          </text>

          {/* TP */}
          <line x1="40" x2="248" y1="60" y2="60" stroke="#22D3EE" strokeWidth="1" strokeDasharray="3 3" />
          <rect x="6" y="51" width="30" height="18" rx="3" fill="rgba(0,0,0,0.78)" stroke="#22D3EE" />
          <text
            x="21"
            y="63"
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui"
            fill="#22D3EE"
          >
            TP
          </text>

          {/* SL */}
          <line x1="40" x2="248" y1="180" y2="180" stroke="#E13947" strokeWidth="1" strokeDasharray="3 3" />
          <rect x="6" y="171" width="30" height="18" rx="3" fill="rgba(0,0,0,0.78)" stroke="#E13947" />
          <text
            x="21"
            y="183"
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui"
            fill="#E13947"
          >
            SL
          </text>
        </svg>
      </div>

      {/* Animated tap cursor — subtle pulse near the BUY plan handle */}
      <div
        className={`pointer-events-none absolute z-20 transition-opacity duration-200 ${flash ? "opacity-100" : "opacity-0"}`}
        style={{
          left: "30px",
          top: "112px",
        }}
        aria-hidden
      >
        <div className="relative">
          <span className="block h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.7)]" />
          <span className="absolute -inset-2 rounded-full border border-cyan-300/55 animate-ping" />
        </div>
      </div>
    </div>
  );
}

function AxeFrame({ seed }: { seed: number }) {
  const showSecond = seed % 4 >= 1;
  const showThird = seed % 4 >= 2;
  const showTyping = seed % 4 === 3;

  return (
    <div className="relative h-full bg-[#030810] px-3 pt-2">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Image
            src="/axe-logo-companion.png"
            alt=""
            width={26}
            height={26}
            className="mt-0.5 h-6 w-6 object-contain"
          />
          <div>
            <p className="text-[12px] font-bold tracking-tight text-tos-text">AXE</p>
            <p className="text-[9px] text-tos-muted">Trading copilot · live</p>
          </div>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-cyan-200/95">
          Pro
        </span>
      </header>

      <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
        <p className="text-[8px] font-medium uppercase tracking-wider text-cyan-200/80">
          Pinned context
        </p>
        <p className="mt-0.5 text-[9.5px] leading-relaxed text-tos-muted">
          XAUUSD · H1 · open H&L scalp long · SL 4694, TP 4724 · risk 0.6%.
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Bubble role="user">{`What's structure on XAU H1 right now?`}</Bubble>
        {showSecond ? (
          <Bubble role="axe">
            HH/HL intact — last impulse from 4682 → 4710 holds. 4698–4702 is the pull-back zone (50% Fib).
            Below 4694 = invalidation.
          </Bubble>
        ) : null}
        {showThird ? (
          <Bubble role="user">Should I add to the long here?</Bubble>
        ) : null}
        {showTyping ? (
          <div className="flex items-start">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5">
              <div className="flex gap-0.5">
                <span className="h-1 w-1 animate-pulse rounded-full bg-cyan-300" style={{ animationDelay: "0ms" }} />
                <span className="h-1 w-1 animate-pulse rounded-full bg-cyan-300" style={{ animationDelay: "120ms" }} />
                <span className="h-1 w-1 animate-pulse rounded-full bg-cyan-300" style={{ animationDelay: "240ms" }} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="absolute inset-x-3 bottom-2 flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 py-1.5">
        <Sparkles className="h-3 w-3 text-cyan-300/80" aria-hidden />
        <span className="flex-1 truncate text-[9.5px] text-tos-dim">Ask AXE about this chart…</span>
        <span className="grid h-5 w-5 place-items-center rounded-md bg-cyan-400/85 text-[#04161B]">
          <MessageSquare className="h-2.5 w-2.5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "axe"; children: React.ReactNode }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl border border-cyan-400/22 bg-cyan-400/[0.06] px-2.5 py-1.5 text-[10px] leading-relaxed text-cyan-50">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-[10px] leading-relaxed text-tos-text">
        {children}
      </div>
    </div>
  );
}

function ExecDock({ active, seed }: { active: boolean; seed: number }) {
  const flash = active && seed % 2 === 0;
  return (
    <div className="absolute inset-x-0 bottom-[30px] z-10 px-2 pb-1">
      <div
        className={`relative overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.04] p-1 shadow-[0_-12px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-2xl ${
          flash ? "ring-1 ring-cyan-300/45" : ""
        }`}
      >
        <div className="flex h-9 items-stretch gap-1">
          <button
            type="button"
            className="flex flex-1 items-center justify-between rounded-[1rem] bg-gradient-to-r from-[#3A0710] via-[#9C1A26] to-[#E13947] px-2 text-left"
          >
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/95">Sell</span>
            <span className="font-mono text-[12px] font-bold text-white">4708.20</span>
          </button>
          <div className="flex w-12 flex-col items-center justify-center rounded-[1rem] border border-white/[0.08] bg-[#08080a]/80 text-[9px] font-semibold text-tos-text">
            <span className="text-[7px] uppercase tracking-[0.2em] text-tos-dim">Lots</span>
            <span className="font-mono text-[10px]">0.10</span>
          </div>
          <button
            type="button"
            className={`flex flex-1 items-center justify-between rounded-[1rem] bg-gradient-to-r from-[#063D44] via-[#0F94A5] to-[#22D3EE] px-2 text-left ${
              flash ? "shadow-[inset_0_0_24px_rgba(34,211,238,0.45)]" : ""
            }`}
          >
            <span className="text-[8px] font-semibold uppercase tracking-wide text-white/95">Buy</span>
            <span className="font-mono text-[12px] font-bold text-white">4708.60</span>
          </button>
        </div>
        <div className="mt-1 flex h-5 items-stretch gap-1">
          <div className="flex flex-1 items-center justify-between gap-1.5 rounded-[0.85rem] border border-white/[0.08] bg-black/45 px-2 text-[8px] font-semibold uppercase tracking-wide text-tos-text">
            <ChevronDown className="h-2 w-2 text-cyan-200" aria-hidden />
            <span>Market</span>
            <span className="font-mono text-[8px] text-tos-muted">0.10</span>
          </div>
          <div className="flex w-7 items-center justify-center rounded-[0.85rem] border border-rose-500/55 bg-rose-500/12 text-[8px] font-bold uppercase tracking-wider text-rose-200/95">
            SL
          </div>
          <div className="flex w-7 items-center justify-center rounded-[0.85rem] border border-emerald-400/55 bg-emerald-400/12 text-[8px] font-bold uppercase tracking-wider text-emerald-200/95">
            TP
          </div>
          <div className="flex w-10 items-center justify-center gap-1 rounded-[0.85rem] border border-white/[0.08] bg-black/45 text-[8px] font-bold uppercase tracking-wider text-tos-muted">
            <span>DEV</span>
            <span className="font-mono text-tos-text">10</span>
          </div>
        </div>
      </div>
    </div>
  );
}
