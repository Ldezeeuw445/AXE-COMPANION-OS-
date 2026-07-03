"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Brain,
  CandlestickChart,
  ChevronRight,
  RadioTower,
  Sparkles,
} from "lucide-react";

const HERO_TABS = [
  {
    id: "chart",
    label: "Chart",
    title: "A full trading surface, not a chart preview.",
    description:
      "Live MT5 price, structure, Auto-Fib, trend tools, indicators and execution remain visible in one phone-first workspace.",
    screenshot: "/launch/app-real/chart.png",
    Icon: CandlestickChart,
    fragments: [
      {
        label: "Chart tools",
        detail: "Structure · OB · FVG · Auto Fib",
        image: "/launch/app-real/chart-tools.png",
        position: "50% 31%",
      },
      {
        label: "Indicators",
        detail: "RSI · VWAP · POC · MACD",
        image: "/launch/app-real/chart-tools.png",
        position: "50% 68%",
      },
    ],
  },
  {
    id: "intel",
    label: "Intel",
    title: "Alternative data becomes one operating picture.",
    description:
      "Market tide, military movement, chokepoints, vessels and macro signals are brought together before AXE makes the correlation.",
    screenshot: "/launch/app-real/intel.png",
    Icon: RadioTower,
    fragments: [
      {
        label: "Military radar",
        detail: "200 airborne · live",
        image: "/launch/app-real/intel-radar.png",
        position: "50% 35%",
      },
      {
        label: "Global chokepoints",
        detail: "Critical supply routes",
        image: "/launch/app-real/intel-chokepoints.png",
        position: "50% 42%",
      },
    ],
  },
  {
    id: "cockpit",
    label: "Cockpit",
    title: "The assistant learns the trader behind the account.",
    description:
      "Alignment, learning arc and behavior patterns show how AXE adapts to feedback, market focus and the way you actually trade.",
    screenshot: "/launch/app-real/cockpit.png",
    Icon: Sparkles,
    fragments: [
      {
        label: "Learning arc",
        detail: "Analysis · planning · access",
        image: "/launch/app-real/cockpit-learning.png",
        position: "50% 47%",
      },
      {
        label: "Behavior map",
        detail: "Sessions · instruments · patterns",
        image: "/launch/app-real/cockpit-behavior.png",
        position: "50% 46%",
      },
    ],
  },
  {
    id: "axe",
    label: "AXE",
    title: "The assistant is embedded in the trading workflow.",
    description:
      "AXE can move from a chart-aware answer into saved research and one-tap workflows without losing your account or market context.",
    screenshot: "/launch/app-real/axe-chat.png",
    Icon: Brain,
    fragments: [
      {
        label: "Vault memory",
        detail: "Saved analysis and context",
        image: "/launch/app-real/axe-vault.png",
        position: "50% 42%",
      },
      {
        label: "Quick actions",
        detail: "Macro · sentiment · position risk",
        image: "/launch/app-real/axe-actions.png",
        position: "50% 40%",
      },
    ],
  },
] as const;

export function LaunchHeroExperience() {
  const [activeId, setActiveId] =
    useState<(typeof HERO_TABS)[number]["id"]>("chart");
  const activeTab = HERO_TABS.find((tab) => tab.id === activeId) ?? HERO_TABS[0];

  return (
    <div className="relative mx-auto max-w-7xl">
      <div className="launch-hero-orbit pointer-events-none absolute left-1/2 top-[31%] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full" />

      <div className="relative z-10 text-center">
        <div className="launch-kicker mx-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/72">
          <Sparkles className="h-3.5 w-3.5 text-[var(--launch-accent)]" />
          AXE Companion OS · Early access
        </div>

        <h1 className="mt-8 text-balance font-[family-name:var(--font-space)] text-5xl leading-none tracking-[-0.06em] text-white sm:text-6xl lg:text-[5.7rem]">
          AXE Companion.
          <br />
          <span className="launch-logo-gradient">The trader&apos;s phone OS.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-balance text-[15px] leading-7 text-white/58 sm:text-[17px]">
          AXE Companion is what an MT5-native phone workflow should feel like:
          live chart, depth, intel, execution, journal and AXE in one calm dark
          operating surface.
        </p>
      </div>

      <div className="relative z-20 mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
        {HERO_TABS.map((tab) => {
          const TabIcon = tab.Icon;
          const isActive = tab.id === activeId;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={`launch-tab ${isActive ? "launch-tab-active" : ""}`}
              aria-pressed={isActive}
            >
              <TabIcon className="h-4 w-4" />
              <span>{tab.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-35" />
            </button>
          );
        })}
      </div>

      <div className="launch-product-stage relative mt-10">
        <ProductFragment
          key={`${activeTab.id}-left`}
          side="left"
          fragment={activeTab.fragments[0]}
        />

        <div className="launch-real-phone-wrap">
          <div className="launch-phone-shadow absolute inset-x-2 top-16 h-[38rem] rounded-[5rem]" />
          <div key={activeTab.id} className="launch-real-phone">
            <Image
              key={activeTab.screenshot}
              src={activeTab.screenshot}
              alt={`${activeTab.label} screen in AXE Companion`}
              width={1206}
              height={2622}
              priority
              className="h-auto w-full"
              sizes="(max-width: 768px) 88vw, 390px"
            />
          </div>
          <div className="launch-phone-caption">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/36">
              {activeTab.label}
            </p>
            <p className="mt-2 text-base font-medium tracking-[-0.02em] text-white/86">
              {activeTab.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/46">
              {activeTab.description}
            </p>
          </div>
        </div>

        <ProductFragment
          key={`${activeTab.id}-right`}
          side="right"
          fragment={activeTab.fragments[1]}
        />
      </div>
    </div>
  );
}

function ProductFragment({
  fragment,
  side,
}: {
  fragment: (typeof HERO_TABS)[number]["fragments"][number];
  side: "left" | "right";
}) {
  return (
    <div className={`launch-app-fragment launch-app-fragment-${side}`}>
      <div className="launch-fragment-image">
        <Image
          src={fragment.image}
          alt={fragment.label}
          fill
          className="object-cover"
          style={{ objectPosition: fragment.position }}
          sizes="310px"
        />
        <div className="launch-fragment-vignette" />
      </div>
      <div className="launch-fragment-label">
        <span>{fragment.label}</span>
        <small>{fragment.detail}</small>
      </div>
    </div>
  );
}
