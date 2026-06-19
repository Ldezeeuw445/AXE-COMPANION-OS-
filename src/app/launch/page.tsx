import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";
import {
  Brain,
  ChevronRight,
  Layers3,
  Shield,
  Smartphone,
  Target,
} from "lucide-react";
import { LegalNavLinks } from "@/components/legal/LegalNavLinks";
import { LaunchHeroExperience } from "@/components/marketing/LaunchHeroExperience";
import { LandingOpenAppQr } from "@/components/marketing/LandingOpenAppQr";
import { LandingWaitlist } from "@/components/marketing/LandingWaitlist";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-launch-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trading OS Launch",
  description:
    "Premium dark launch page for Trading OS — real app screenshots, chart, depth, intel, execution and AXE in one phone-first workflow.",
};

const FEATURE_STRIP = [
  "Live chart, premium toolset",
  "Market depth drawer",
  "News & intel, cached to save credits",
  "One-tap execution dock",
  "AXE copilot that knows the app",
] as const;

const SHOWCASE_SECTIONS = [
  {
    kicker: "01 · Chart",
    title: "The chart feels like the product, not the marketing layer around it.",
    copy:
      "MT5 ticks, Lightweight Charts, Auto-Fib, structure, OB, FVG, iFVG and a real execution dock all live on the same canvas. Nothing here feels detached from the trading surface.",
    image: "/launch/809_1x_shots_so.png",
    bullets: [
      "Auto-Fib (Auto / Swing / Day), Auto-Trend, BOS / CHoCH, swing points and MA stack.",
      "Demo trading on live ticks, so the free experience still teaches the real workflow.",
    ],
  },
  {
    kicker: "02 · Intel",
    title: "News, conviction and saved research arrive as one operating picture.",
    copy:
      "Polygon, Perigon, Finnhub, EODHD and FRED feed the intel layer, while AXE can pin the result into vault notes and explain what matters in the same dark language as the rest of the app.",
    image: "/launch/595_1x_shots_so.png",
    bullets: [
      "Smart 5-minute caching keeps provider costs sane during quieter periods.",
      "Market tide, energy flow, vessel tracking and macro context can all land in saved workspace memory.",
    ],
  },
  {
    kicker: "03 · Accounts",
    title: "Multi-account, multi-broker, and still calm enough to trust on the phone.",
    copy:
      "Funded, demo and live accounts can live in the same companion OS with one active account at a time, clear server setup, and the same Supabase-backed memory that Trading OS will use on desktop.",
    image: "/launch/338_1x_shots_so.png",
    bullets: [
      "AXE demo account is instant; live execution stays behind explicit activation and account context.",
      "Row-Level Security keeps each workspace scoped correctly instead of faking isolation.",
    ],
  },
] as const;

const DETAIL_CARDS = [
  {
    title: "Depth that is honest",
    body:
      "Real broker bid / ask at L1, synthetic ladder around it, and clear labeling so you always know what is anchored and what is estimated.",
    icon: Layers3,
  },
  {
    title: "AXE that knows the workspace",
    body:
      "Chat can read the chart, your accounts, your journal and saved context, then answer in the same product instead of in a detached assistant shell.",
    icon: Brain,
  },
  {
    title: "Guardrails before execution",
    body:
      "Market and limit flows, SL, TP and deviation all sit behind a safer activation path. Helpful by default, sharp only when you mean it.",
    icon: Shield,
  },
] as const;

const FAQ = [
  {
    q: "Is this using real app screens or staged mockups?",
    a: "Real app screens. The new route just gives them a more premium launch presentation.",
  },
  {
    q: "Can Trading OS run without Trading OS desktop?",
    a: "Yes. Chart, depth, news, intel, accounts, journal and AXE all work as a standalone phone-first product.",
  },
  {
    q: "How does execution stay safe?",
    a: "New accounts can start in the built-in demo flow on live ticks. Live execution remains behind explicit account and activation steps.",
  },
  {
    q: "Why keep the page dark and restrained?",
    a: "Because the app already carries the color. The launch page should frame the product like a gallery, not compete with it.",
  },
] as const;

function ShowcaseSection({
  kicker,
  title,
  copy,
  image,
  bullets,
  reverse = false,
}: {
  kicker: string;
  title: string;
  copy: string;
  image: string;
  bullets: readonly string[];
  reverse?: boolean;
}) {
  return (
    <section
      className={`grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center ${reverse ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}
    >
      <div className="launch-copy-card">
        <p className="launch-panel-kicker">{kicker}</p>
        <h2 className="mt-4 font-[family-name:var(--font-space)] text-3xl leading-tight tracking-[-0.05em] text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/58">
          {copy}
        </p>
        <div className="mt-6 space-y-3">
          {bullets.map((bullet) => (
            <div key={bullet} className="launch-bullet-row">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--launch-accent)]" />
              <p className="text-sm leading-7 text-white/58">{bullet}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="launch-shot-frame">
        <div className="launch-shot-glow" />
        <Image
          src={image}
          alt={title}
          width={1080}
          height={1080}
          className="relative z-10 w-full rounded-[2rem] object-cover"
          sizes="(max-width: 1024px) 100vw, 48vw"
        />
      </div>
    </section>
  );
}

export default function LaunchPage() {
  return (
    <div
      className={`launch-page ${spaceGrotesk.variable} ${manrope.variable}`}
      style={{ fontFamily: "var(--font-launch-body), var(--font-inter), sans-serif" }}
    >
      <div className="launch-noise" />

      <header className="sticky top-0 z-50 border-b border-white/7 bg-[#070709]/78 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/trading-os-wordmark.png"
              alt="Trading OS"
              width={180}
              height={28}
              className="h-6 w-auto object-contain opacity-95"
              unoptimized
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="#product" className="launch-nav-link hidden sm:inline-flex">
              Product
            </Link>
            <Link href="/login" className="launch-nav-link">
              Log in
            </Link>
            <Link href="#launch-access" className="launch-primary-btn hidden sm:inline-flex">
              Early access
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="px-5 pb-18 pt-12 sm:px-8 sm:pt-16 lg:pb-24">
          <LaunchHeroExperience />

          <div className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-3">
            <Link href="/login" className="launch-primary-btn">
              Open AXE on web or PWA
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link href="/welcome" className="launch-secondary-btn">
              <Smartphone className="h-4 w-4" />
              Install as PWA
            </Link>
          </div>
        </section>

        <section className="border-y border-white/7 bg-white/[0.015] px-5 py-5 sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">
            {FEATURE_STRIP.map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[var(--launch-accent)]" />
                {item}
              </span>
            ))}
          </div>
        </section>

        <section id="product" className="mx-auto max-w-7xl px-5 py-18 sm:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="launch-panel-kicker justify-center">One trading workspace</p>
            <h2 className="mt-4 font-[family-name:var(--font-space)] text-3xl tracking-[-0.05em] text-white sm:text-4xl">
              Built around the way traders actually move.
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-white/58">
              Chart, depth, execution, intel, accounts and AXE stay connected
              inside one calm phone-first operating surface. Every screen is
              designed to keep context close and friction low.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {DETAIL_CARDS.map(({ title, body, icon: Icon }) => (
              <div key={title} className="launch-detail-card">
                <div className="launch-icon-well">
                  <Icon className="h-5 w-5 text-[var(--launch-accent)]" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.03em] text-white">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/56">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-18 px-5 pb-18 sm:px-8 lg:space-y-24 lg:pb-24">
          {SHOWCASE_SECTIONS.map((section, index) => (
            <ShowcaseSection
              key={section.title}
              {...section}
              reverse={index % 2 === 1}
            />
          ))}
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-18 sm:px-8 lg:pb-24">
          <div className="launch-wide-showcase">
            <div className="max-w-2xl">
              <p className="launch-panel-kicker">Gallery composition</p>
              <h2 className="mt-4 font-[family-name:var(--font-space)] text-3xl tracking-[-0.05em] text-white sm:text-4xl">
                The product already has enough light. The page only needs to
                reveal it.
              </h2>
              <p className="mt-5 text-[15px] leading-7 text-white/58">
                That is why the background stays almost black, the gradients are
                restrained, and the glow comes from the screenshots, logo
                treatment and hover interaction instead of a loud blue wash.
              </p>
            </div>
            <div className="launch-wide-image-frame mt-10">
              <Image
                src="/launch/570_1x_shots_so.png"
                alt="Trading OS gallery trio"
                width={1920}
                height={1080}
                className="relative z-10 w-full rounded-[2rem] object-cover"
                sizes="100vw"
              />
            </div>
          </div>
        </section>

        <section
          id="launch-access"
          className="mx-auto max-w-7xl px-5 pb-18 sm:px-8 lg:pb-24"
        >
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="launch-copy-card">
              <p className="launch-panel-kicker">Launch access</p>
              <h2 className="mt-4 font-[family-name:var(--font-space)] text-3xl tracking-[-0.05em] text-white sm:text-4xl">
                Open it on the phone you actually trade on.
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-white/58">
                Free to start, demo-ready on live ticks, and designed to grow
                into the same Supabase-backed workspace as Trading OS on
                desktop.
              </p>
              <div className="mt-7">
                <LandingWaitlist />
              </div>
            </div>
            <div className="launch-copy-card">
              <p className="launch-panel-kicker">Open on your phone</p>
              <h2 className="mt-4 font-[family-name:var(--font-space)] text-3xl tracking-[-0.05em] text-white sm:text-4xl">
                Same product, cleaner handoff.
              </h2>
              <p className="mt-5 text-[15px] leading-7 text-white/58">
                Use the existing web app, install it as a PWA, and keep the same
                login when the desktop terminal comes online.
              </p>
              <div className="mt-7">
                <LandingOpenAppQr />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 pb-18 sm:px-8 lg:pb-24">
          <div className="launch-copy-card">
            <div className="flex items-center justify-center gap-2">
              <Target className="h-4 w-4 text-[var(--launch-accent)]" />
              <p className="launch-panel-kicker justify-center">FAQ</p>
            </div>
            <div className="mt-8 space-y-3">
              {FAQ.map((item) => (
                <details
                  key={item.q}
                  className="launch-faq group rounded-[1.5rem] border border-white/8 px-5 py-4"
                >
                  <summary className="cursor-pointer list-none text-left text-sm font-semibold text-white/88 marker:content-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                  </summary>
                  <p className="pt-3 text-sm leading-7 text-white/56">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/7 px-5 py-10 text-center text-[11px] text-white/34 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="font-medium uppercase tracking-[0.24em] text-white/38">
            Trading OS
          </p>
          <p className="mt-3 text-white/42">
            Chart, intel and execution in one phone-first workspace.
          </p>
          <LegalNavLinks className="mt-6" />
        </div>
      </footer>
    </div>
  );
}
