"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Brain, CandlestickChart, ChevronRight, Radar, Sparkles } from "lucide-react";

type HeroPoint = {
  id: string;
  title: string;
  body: string;
  x: string;
  y: string;
};

type HeroTab = {
  id: "chart" | "intel" | "cockpit" | "axe";
  label: string;
  title: string;
  subtitle: string;
  screenshot: string;
  Icon: typeof Brain;
  points: HeroPoint[];
};

const HERO_TABS: HeroTab[] = [
  {
    id: "chart",
    label: "Chart",
    title: "Klikbare chart workflow, geen fake mock.",
    subtitle:
      "Market structure, fib, pending orders en execution bridge zitten in dezelfde flow.",
    screenshot: "/launch/app-real/chart.png",
    Icon: CandlestickChart,
    points: [
      {
        id: "tools",
        title: "Structure + Fib stack",
        body: "Auto Fib, trend, OB/FVG en drawing-layer op dezelfde chart context.",
        x: "18%",
        y: "34%",
      },
      {
        id: "bridge",
        title: "Execution bridge",
        body: "One-click market of pending order mode met duidelijke guardrails.",
        x: "62%",
        y: "76%",
      },
      {
        id: "dock",
        title: "Bottom nav continuity",
        body: "Zelfde tabs, routes en gedrag als in de echte app.",
        x: "51%",
        y: "93%",
      },
    ],
  },
  {
    id: "intel",
    label: "Intel",
    title: "Intel laag als operating picture.",
    subtitle:
      "Radar, chokepoints, macro en conviction in dezelfde donkere taal als de app.",
    screenshot: "/launch/app-real/intel.png",
    Icon: Radar,
    points: [
      {
        id: "conviction",
        title: "Conviction cards",
        body: "Per market meteen bias, confidence en context zonder noise.",
        x: "24%",
        y: "33%",
      },
      {
        id: "choke",
        title: "Global chokepoints",
        body: "Physical world events gekoppeld aan market narrative.",
        x: "54%",
        y: "56%",
      },
      {
        id: "save",
        title: "Save to memory",
        body: "Belangrijke intel kan direct door naar AXE/Vault context.",
        x: "31%",
        y: "84%",
      },
    ],
  },
  {
    id: "cockpit",
    label: "Cockpit",
    title: "Behavior feedback die echt stuurt.",
    subtitle:
      "Niet alleen PnL, maar patronen, sessies en focusgebieden die je edge bepalen.",
    screenshot: "/launch/app-real/cockpit.png",
    Icon: Sparkles,
    points: [
      {
        id: "sessions",
        title: "Session behavior map",
        body: "Direct zien waar aandacht en performance samenkomen.",
        x: "26%",
        y: "36%",
      },
      {
        id: "instruments",
        title: "Instrument concentration",
        body: "Focus vs distraction per instrument cluster.",
        x: "58%",
        y: "58%",
      },
      {
        id: "coach",
        title: "AXE coaching handoff",
        body: "Cockpit insights lopen door naar chat prompts en workflows.",
        x: "40%",
        y: "82%",
      },
    ],
  },
  {
    id: "axe",
    label: "AXE",
    title: "AXE als workflow-engine, niet alleen chat.",
    subtitle:
      "Chart-aware antwoorden, vault memory en actions blijven in dezelfde product surface.",
    screenshot: "/launch/app-real/axe-chat.png",
    Icon: Brain,
    points: [
      {
        id: "context",
        title: "Live context aware",
        body: "AXE kent active pair, account state en recente trades.",
        x: "22%",
        y: "36%",
      },
      {
        id: "memory",
        title: "Memory loop",
        body: "Belangrijke output gaat terug de workspace in voor volgende beslissingen.",
        x: "62%",
        y: "63%",
      },
      {
        id: "actions",
        title: "Action handoff",
        body: "Van insight naar concrete action zonder context-switch.",
        x: "42%",
        y: "88%",
      },
    ],
  },
];

const BANNER_ITEMS = [
  "Live chart, premium toolset",
  "Market depth drawer",
  "News & intel, cached to save credits",
  "One-tap execution dock",
  "AXE copilot that knows the app",
] as const;

export function FinalHeroExperience() {
  const [activeTabId, setActiveTabId] = useState<HeroTab["id"]>("chart");
  const [activePointId, setActivePointId] = useState("tools");
  const [isMockHovered, setIsMockHovered] = useState(false);

  const activeTab = useMemo(
    () => HERO_TABS.find((tab) => tab.id === activeTabId) ?? HERO_TABS[0],
    [activeTabId],
  );

  const activePoint = useMemo(
    () => activeTab.points.find((point) => point.id === activePointId) ?? activeTab.points[0],
    [activePointId, activeTab],
  );

  const handleTabChange = (tab: HeroTab) => {
    setActiveTabId(tab.id);
    setActivePointId(tab.points[0]?.id ?? "tools");
  };

  return (
    <div className="relative mx-auto max-w-7xl">
      <div className="launch-hero-orbit pointer-events-none absolute left-1/2 top-[24%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full" />

      <div className="launch-final-banner-wrap relative mx-auto mb-8 max-w-5xl">
        <div
          className="launch-final-banner"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            event.currentTarget.style.setProperty("--launch-banner-x", `${x}%`);
          }}
        >
          <div className="launch-final-banner-track">
            {[...BANNER_ITEMS, ...BANNER_ITEMS].map((item, idx) => (
              <span key={`${item}-${idx}`} className="launch-final-banner-item">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 text-center">
        <div className="launch-kicker mx-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/72">
          <Sparkles className="h-3.5 w-3.5 text-[var(--launch-accent)]" />
          AXE Companion · interactive final
        </div>
        <h1 className="mt-7 text-balance font-[family-name:var(--font-space)] text-5xl leading-none tracking-[-0.06em] text-white sm:text-6xl lg:text-[5.35rem]">
          See the product.
          <br />
          <span className="launch-logo-gradient">Understand it in one hero.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-balance text-[15px] leading-7 text-white/58 sm:text-[17px]">
          Klik op tabs en hotspots. Elke flow laat meteen zien wat je krijgt,
          waarom het werkt, en hoe het samenkomt in een Supabase-backed workspace.
        </p>
      </div>

      <div className="relative z-20 mx-auto mt-9 flex max-w-4xl flex-wrap justify-center gap-2">
        {HERO_TABS.map((tab) => {
          const Icon = tab.Icon;
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={`launch-tab ${isActive ? "launch-tab-active" : ""}`}
              aria-pressed={isActive}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-35" />
            </button>
          );
        })}
      </div>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr_0.9fr]">
        <div className="launch-copy-card">
          <p className="launch-panel-kicker">Current tab</p>
          <h2 className="mt-4 font-[family-name:var(--font-space)] text-3xl tracking-[-0.05em] text-white">
            {activeTab.title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/58">{activeTab.subtitle}</p>
          <div className="mt-6 space-y-2">
            {activeTab.points.map((point) => {
              const active = activePoint.id === point.id;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => setActivePointId(point.id)}
                  className={`w-full rounded-2xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-cyan-300/40 bg-cyan-300/[0.12] text-white"
                      : "border-white/10 bg-white/[0.03] text-white/72 hover:border-white/20"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]">{point.title}</p>
                  <p className="mt-1 text-[12px] leading-5 opacity-90">{point.body}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="launch-real-phone-wrap w-full max-w-[26rem] justify-self-center">
          <div
            key={activeTab.id}
            className={`launch-dot-grid ${isMockHovered ? "launch-dot-grid-active" : ""}`}
          />
          <div className="launch-phone-shadow absolute inset-x-4 top-14 h-[40rem] rounded-[5rem]" />
          <div
            key={activeTab.id}
            className="launch-real-phone relative"
            onMouseEnter={() => setIsMockHovered(true)}
            onMouseLeave={() => setIsMockHovered(false)}
          >
            <Image
              src={activeTab.screenshot}
              alt={`${activeTab.label} screen in AXE Companion`}
              width={1206}
              height={2622}
              priority
              className="h-auto w-full"
              sizes="(max-width: 768px) 88vw, 410px"
            />

            {activeTab.points.map((point) => {
              const active = activePoint.id === point.id;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => setActivePointId(point.id)}
                  className={`absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition ${
                    active
                      ? "border-cyan-200 bg-cyan-300/80 shadow-[0_0_24px_rgba(70,220,255,0.9)]"
                      : "border-white/70 bg-white/25 hover:bg-white/45"
                  }`}
                  style={{ left: point.x, top: point.y }}
                  aria-label={point.title}
                >
                  <span className="sr-only">{point.title}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs uppercase tracking-[0.2em] text-white/38">
            Clickable mock · {activeTab.label}
          </p>
        </div>

        <div className="launch-copy-card">
          <p className="launch-panel-kicker">Selected block</p>
          <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-white">
            {activePoint.title}
          </h3>
          <p className="mt-3 text-sm leading-7 text-white/58">{activePoint.body}</p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Why this closes the pitch
            </p>
            <p className="mt-2 text-[13px] leading-6 text-white/65">
              Bezoekers zien direct wat ze kunnen doen in de app, zonder eerst
              lange tekst te lezen. De hero doet meteen de product-demonstratie.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
