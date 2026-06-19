"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Activity,
  Brain,
  CandlestickChart,
  ChevronRight,
  Layers3,
  Newspaper,
  Sparkles,
  Zap,
} from "lucide-react";

const HERO_TABS = [
  {
    id: "chart",
    label: "Chart",
    title: "Real chart canvas. No fake concept UI.",
    description:
      "Auto-Fib, structure, OB, FVG, iFVG and indicators live on the same MT5-driven chart instead of being split into a separate analysis mode.",
    screenshot: "/launch/446_1x_shots_so.png",
    Icon: CandlestickChart,
    leftPanel: {
      kicker: "Chart tools",
      title: "Everything that matters opens in-place.",
      lines: [
        "Auto Fib, Auto Trend, structure, OB, FVG, iFVG, PDH / PDL and projection tools.",
        "Built for one-thumb trading: open the panel, mark the level, stay on price.",
      ],
      pills: ["Auto Fib", "Structure", "OB", "FVG", "iFVG", "Project"],
    },
    rightPanel: {
      kicker: "Indicators",
      title: "Fast enough to stay quiet.",
      stats: [
        { label: "Stack", value: "RSI · VWAP · POC" },
        { label: "Feel", value: "No clutter" },
        { label: "Canvas", value: "MT5 live ticks" },
      ],
    },
  },
  {
    id: "depth",
    label: "Depth",
    title: "A depth drawer that explains what is real.",
    description:
      "L1 bid and ask are anchored to the broker feed, while the surrounding ladder stays explicit about what is estimated so the interface never lies to the trader.",
    screenshot: "/launch/423_1x_shots_so-2.png",
    Icon: Layers3,
    leftPanel: {
      kicker: "Spread context",
      title: "Price, pressure and pace in one glance.",
      lines: [
        "Live spread, mid, cumulative volume and uptick / downtick blocks all stay visible.",
        "The ladder reads like a tool, not a gimmick. That is the point.",
      ],
      pills: ["L1 live", "L2 estimated", "Cum size", "Uptick", "Downtick"],
    },
    rightPanel: {
      kicker: "Execution read",
      title: "Built to support action, not distract from it.",
      stats: [
        { label: "Anchor", value: "Broker bid / ask" },
        { label: "Spread", value: "Always visible" },
        { label: "Behavior", value: "Tick-by-tick" },
      ],
    },
  },
  {
    id: "conviction",
    label: "Intel",
    title: "Market conviction and choke points in the same dark language.",
    description:
      "Polygon, Perigon, Finnhub, EODHD, FRED and AXE intel combine into one calmer operating picture, with cache strategy built in so a quiet hour does not burn credits.",
    screenshot: "/launch/688_1x_shots_so.png",
    Icon: Newspaper,
    leftPanel: {
      kicker: "Intel tide",
      title: "Strong signals look curated, not loud.",
      lines: [
        "Bullish, bearish and neutral conviction blocks rank what deserves attention right now.",
        "Macro chokepoints and energy flow can sit next to the same watchlist.",
      ],
      pills: ["Polygon", "Perigon", "Finnhub", "EODHD", "FRED"],
    },
    rightPanel: {
      kicker: "Cache logic",
      title: "Paid providers first. Waste last.",
      stats: [
        { label: "Priority", value: "Polygon first" },
        { label: "Cache", value: "5 min smart cache" },
        { label: "Intent", value: "Lower quota burn" },
      ],
    },
  },
  {
    id: "actions",
    label: "Actions",
    title: "One-tap workflows with execution still under control.",
    description:
      "AXE can surface the next macro risk, sentiment summary or pair-specific context in a single action, while live execution stays behind the proper guardrails.",
    screenshot: "/launch/873_1x_shots_so.png",
    Icon: Zap,
    leftPanel: {
      kicker: "Quick workflows",
      title: "Ask less. Move faster.",
      lines: [
        "Open chat, pull the next high-impact release, summarize sentiment, or anchor the day around the active pair.",
        "The system stays opinionated without pretending to trade for you.",
      ],
      pills: ["Open chat", "Macro risk", "Sentiment", "Pair context"],
    },
    rightPanel: {
      kicker: "Guardrails",
      title: "Helpful by default. Dangerous only on purpose.",
      stats: [
        { label: "Default", value: "Execution off" },
        { label: "Flow", value: "One-tap prompts" },
        { label: "Trust", value: "Human final say" },
      ],
    },
  },
  {
    id: "axe",
    label: "AXE",
    title: "The assistant speaks in the language of the app.",
    description:
      "AXE can read chart context, journal activity, account state and saved workspace memory, then respond directly inside the same product surface.",
    screenshot: "/launch/569_1x_shots_so.png",
    Icon: Brain,
    leftPanel: {
      kicker: "Context pinned",
      title: "Private channel, not generic chatbot paste.",
      lines: [
        "The reply can reference structure, catalysts, support, resistance and the actual pair you are focused on.",
        "It explains uncertainty when it exists instead of filling the screen with noise.",
      ],
      pills: ["Chart aware", "Journal aware", "Account aware", "Memory aware"],
    },
    rightPanel: {
      kicker: "Voice",
      title: "Opinionated where silence would be lazy.",
      stats: [
        { label: "Mode", value: "Analysis first" },
        { label: "Context", value: "Workspace-linked" },
        { label: "Tone", value: "Clear and direct" },
      ],
    },
  },
] as const;

export function LaunchHeroExperience() {
  const [activeId, setActiveId] = useState<(typeof HERO_TABS)[number]["id"]>("chart");
  const activeTab = HERO_TABS.find((tab) => tab.id === activeId) ?? HERO_TABS[0];
  const ActiveIcon = activeTab.Icon;

  return (
    <div className="relative mx-auto max-w-7xl">
      <div className="launch-hero-orbit pointer-events-none absolute left-1/2 top-[22%] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full" />

      <div className="relative z-10 text-center">
        <div className="launch-kicker mx-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/72">
          <Sparkles className="h-3.5 w-3.5 text-[var(--launch-accent)]" />
          Trading OS · Early access
        </div>

        <h1 className="mt-8 text-balance font-[family-name:var(--font-space)] text-5xl leading-none tracking-[-0.06em] text-white sm:text-6xl lg:text-[5.7rem]">
          Trading OS.
          <br />
          <span className="launch-logo-gradient">The trader&apos;s phone OS.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-balance text-[15px] leading-7 text-white/58 sm:text-[17px]">
          Trading OS is what an MT5-native phone workflow should feel like:
          live chart, depth, news, intel, execution, journal and AXE in one
          calm dark operating surface.
        </p>
      </div>

      <div className="relative mt-14 min-h-[46rem] lg:min-h-[42rem]">
        <aside className="hidden lg:block">
          <div className="launch-side-panel absolute left-0 top-14 w-[20rem]">
            <p className="launch-panel-kicker">{activeTab.leftPanel.kicker}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
              {activeTab.leftPanel.title}
            </h2>
            <div className="mt-5 space-y-3 text-sm leading-7 text-white/56">
              {activeTab.leftPanel.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {activeTab.leftPanel.pills.map((pill) => (
                <span key={pill} className="launch-chip">
                  {pill}
                </span>
              ))}
            </div>
          </div>

          <div className="launch-side-panel absolute right-0 top-20 w-[19rem]">
            <div className="flex items-center justify-between">
              <div>
                <p className="launch-panel-kicker">{activeTab.rightPanel.kicker}</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                  {activeTab.rightPanel.title}
                </h2>
              </div>
              <div className="launch-icon-well">
                <ActiveIcon className="h-5 w-5 text-[var(--launch-accent)]" />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {activeTab.rightPanel.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="launch-stat-card flex items-center justify-between gap-4"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">
                    {stat.label}
                  </span>
                  <span className="text-sm font-medium text-white/82">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="launch-inline-note mt-5 flex items-center gap-2 text-sm text-white/54">
              <Activity className="h-4 w-4 text-[var(--launch-accent)]" />
              {activeTab.description}
            </div>
          </div>
        </aside>

        <div className="relative mx-auto flex w-full max-w-[22rem] justify-center sm:max-w-[25rem]">
          <div className="launch-phone-shadow absolute inset-x-10 top-8 h-[36rem] rounded-[4rem]" />
          <div className="launch-phone-frame relative w-full rounded-[3.3rem] border border-white/12 p-2 sm:p-2.5">
            <div className="relative overflow-hidden rounded-[3rem] border border-white/8 bg-[#050507]">
              <div className="launch-phone-header flex items-center justify-between px-5 py-4 text-xs text-white/84">
                <span>Trading OS</span>
                <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/42">
                  {activeTab.label}
                </span>
              </div>

              <div className="relative aspect-[9/19.5] w-full">
                <div className="launch-screen-glow pointer-events-none absolute inset-0 z-10" />
                <Image
                  key={activeTab.screenshot}
                  src={activeTab.screenshot}
                  alt={`${activeTab.label} screen preview`}
                  fill
                  priority
                  className="object-cover object-top"
                  sizes="(max-width: 768px) 86vw, 420px"
                />
              </div>

              <div className="border-t border-white/7 bg-black/42 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/36">
                      {activeTab.label}
                    </p>
                    <p className="mt-1 text-sm text-white/80">{activeTab.title}</p>
                  </div>
                  <div className="launch-icon-well shrink-0">
                    <ActiveIcon className="h-4 w-4 text-[var(--launch-accent)]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-3 lg:hidden">
          <div className="launch-side-panel">
            <p className="launch-panel-kicker">{activeTab.leftPanel.kicker}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
              {activeTab.leftPanel.title}
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-white/56">
              {activeTab.leftPanel.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="launch-side-panel">
            <p className="launch-panel-kicker">{activeTab.rightPanel.kicker}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
              {activeTab.rightPanel.title}
            </h2>
            <div className="mt-4 space-y-3">
              {activeTab.rightPanel.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="launch-stat-card flex items-center justify-between gap-4"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">
                    {stat.label}
                  </span>
                  <span className="text-sm font-medium text-white/82">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-2.5">
          {HERO_TABS.map((tab) => {
            const TabIcon = tab.Icon;
            const isActive = tab.id === activeId;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                className={`launch-tab ${isActive ? "launch-tab-active" : ""}`}
              >
                <TabIcon className="h-4 w-4" />
                <span>{tab.label}</span>
                <ChevronRight className="h-3.5 w-3.5 opacity-40" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
