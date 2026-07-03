import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  BarChart2,
  Brain,
  ChevronRight,
  CircuitBoard,
  Compass,
  Layout,
  LineChart,
  Newspaper,
  Radio,
  Shield,
  Smartphone,
  Sparkles,
  Target,
  Wand2,
  Zap,
} from "lucide-react";
import { LandingHeroPhone } from "@/components/marketing/LandingHeroPhone";
import { LandingOpenAppQr } from "@/components/marketing/LandingOpenAppQr";
import { LandingWaitlist } from "@/components/marketing/LandingWaitlist";
import { ComplianceSiteFooter } from "@/components/legal/ComplianceSiteFooter";
import { LEGAL_COPY } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "AXE Companion — chart, intel and execution in one tap",
  description:
    "AXE Companion is the trader phone OS: live MT5 chart with auto-Fib/structure/OB/FVG, market depth drawer, cached multi-source news, smart-money intel, and one-tap execution — all on the same Supabase brain Trading OS uses.",
};

const TICKER = [
  { s: "XAUUSD", p: "4,708.60", up: true, c: "+0.42%" },
  { s: "EURUSD", p: "1.0842", up: false, c: "−0.08%" },
  { s: "GBPJPY", p: "196.42", up: true, c: "+0.15%" },
  { s: "NAS100", p: "20,842.1", up: true, c: "+0.22%" },
  { s: "BTCUSD", p: "98,420", up: false, c: "−0.31%" },
  { s: "US30", p: "44,506", up: true, c: "+0.18%" },
  { s: "US500", p: "5,842.1", up: true, c: "+0.22%" },
  { s: "USOIL", p: "73.42", up: false, c: "−0.45%" },
  { s: "USDJPY", p: "151.84", up: true, c: "+0.11%" },
];

const LANDING_FEATURES = [
  {
    title: "Live chart, premium toolset",
    desc: "MT5 ticks, Lightweight Charts engine, and a calm dark canvas. Auto-Fib (Auto / Swing / Day source), Auto-Trend, swing points, BOS/CHoCH, MA stack — built to feel native, not noisy.",
    Icon: LineChart,
    color: "text-cyan-300",
  },
  {
    title: "Order Blocks, FVG, iFVG that extend",
    desc: "Volumetric order blocks, fair-value gaps, and inverse FVGs that keep extending until they're mitigated. Pick 1, 2, or 3 per side — same per-direction filter for OB and iFVG, no clutter.",
    Icon: CircuitBoard,
    color: "text-teal-300",
  },
  {
    title: "Market depth drawer",
    desc: "Slide out depth from the top bar. Real L1 bid/ask from your broker plus a deterministic synthetic ladder, with spread, mid, uptick / downtick — honest about which level is real and which is estimated.",
    Icon: BarChart2,
    color: "text-cyan-300",
  },
  {
    title: "News & intel, cached to save credits",
    desc: "Polygon, Perigon, Finnhub, EODHD, FRED — with smart 5-minute caching so a quiet hour doesn't burn your provider quota. Smart-money intel via Unusual Whales sits one tap away.",
    Icon: Newspaper,
    color: "text-cyan-300",
  },
  {
    title: "One-tap execution dock",
    desc: "Market, buy / sell limit, SL, TP, deviation — locked to the bottom of the chart with safe-area padding. Cyan / rose gradients, MT5-style lot picker, big activation banner before live orders fly.",
    Icon: Zap,
    color: "text-cyan-200",
  },
  {
    title: "Demo trading on live ticks",
    desc: "Virtual paper account inside AXE, free and instant. Same fills, slippage and PnL math against live prices — perfect for trying setups before pointing it at a funded account.",
    Icon: Activity,
    color: "text-emerald-300",
  },
  {
    title: "AXE — AI-powered market analytics",
    desc: "Chat that reads your chart, accounts, journal, news and intel. Technical analysis and educational context — you make every trading decision.",
    Icon: Brain,
    color: "text-cyan-300",
  },
  {
    title: "Five-tap journal that writes itself",
    desc: "Trades land from MT5, you tap one of five outcomes, AXE pins context. Win rate, profit factor, calendar — all driven from the same broker rows, never a guess.",
    Icon: Sparkles,
    color: "text-teal-300",
  },
  {
    title: "Multi-account, multi-broker, RLS-safe",
    desc: "Funded, demo, live across brokers — one active account at a time, analytics scoped per account. Supabase Row-Level Security keeps every workspace isolated.",
    Icon: Shield,
    color: "text-cyan-200",
  },
];

const SCREEN_TABS = [
  {
    id: "chart",
    label: "Chart",
    body: "Auto-Fib with source picker, swing dots, OB / FVG / iFVG that extend until mitigated. Drag the future-line to project levels past the live candle.",
    icon: LineChart,
  },
  {
    id: "depth",
    label: "Depth",
    body: "Live broker bid / ask anchored at L1; surrounding ladder is synthetic and labelled as such. Spread + mid update tick-by-tick.",
    icon: BarChart2,
  },
  {
    id: "news",
    label: "News",
    body: "Multi-source feed with paid providers first (Polygon → Perigon → Finnhub → EODHD). Cached 5 min so a quiet hour doesn't burn credits.",
    icon: Newspaper,
  },
  {
    id: "exec",
    label: "Execute",
    body: "Market, buy / sell limit, SL, TP, deviation — all from a single dock. Big activation banner with disclaimers before any live order goes out.",
    icon: Zap,
  },
  {
    id: "axe",
    label: "AXE",
    body: "Chat that has your chart, journal, intel and account context pinned. Honest when uncertain, opinionated when it shouldn't be silent.",
    icon: Brain,
  },
] as const;

const FAQ = [
  {
    q: "Is this a real chart with live data, or just a marketing illustration?",
    a: "It's the real chart engine. AXE Companion ships Lightweight Charts wired to MT5 ticks, with auto-Fib (Auto / Swing / Day), auto-trend, OB / FVG / iFVG, PDH / PDL, swing points, BOS/CHoCH, and a market-depth drawer over the live spread. The phone in the hero cycles through the actual screens — same components, same palette.",
  },
  {
    q: "Can I really execute trades from AXE, or is it analytics only?",
    a: "Both. By default new accounts get a free virtual demo wired to live prices for paper trading. Activating live execution requires the master-password account and a one-time disclaimer banner — after that, the BUY / SELL dock sends real orders to MT5 (market, buy / sell limit, SL, TP, deviation).",
  },
  {
    q: "Where do I paste the MT5 link token?",
    a: "Not inside this app. Put it in your MT5 Expert Advisor or bridge that POSTs trades and snapshots to the Supabase Edge function. After the first successful post, trades, equity and live stats flow automatically — see Accounts right after you create a token.",
  },
  {
    q: "Do I need Trading OS on desktop?",
    a: "No to get started — chart, depth, news, intel, alerts, journal, accounts, and AXE all work standalone in the phone OS. Trading OS is the upcoming desktop terminal and shares the same Supabase login. One account, one memory, one trading brain across both.",
  },
  {
    q: "How does news caching keep my provider bills sane?",
    a: "Every news call is keyed by symbol + provider and cached for 5 minutes. Polygon is tried first (paid feed, deepest coverage), then Perigon → Finnhub → EODHD. A quiet hour costs you a single round of cached calls instead of N×providers per page-view.",
  },
  {
    q: "Is this an App Store app?",
    a: "Install the site as a PWA on your home screen (Safari / Chrome) — no App Store required for the core flow. The hero shows what that PWA looks like.",
  },
];

export default function HomeLandingPage() {
  const tickerRow = [...TICKER, ...TICKER];

  return (
    <div className="axe-landing-matte-bg relative min-h-dvh overflow-hidden text-tos-text">
      {/* ─── ambient aurora behind the whole page ─── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[820px]"
        style={{
          background:
            "radial-gradient(900px circle at 22% 18%, rgba(0,224,255,0.07), transparent 55%), radial-gradient(900px circle at 80% 8%, rgba(0,224,255,0.05), transparent 55%), radial-gradient(800px circle at 50% 60%, rgba(0,224,255,0.03), transparent 65%)",
        }}
      />

      {/* ─── header ─── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#020406]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/axe-companion-wordmark.png"
              alt="AXE Companion OS"
              width={200}
              height={36}
              priority
              unoptimized
              className="h-7 w-auto object-contain opacity-95"
              style={{ mixBlendMode: "screen" }}
            />
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="#waitlist"
              className="hidden rounded-full border border-cyan-400/15 bg-cyan-400/[0.03] px-3 py-1.5 text-xs font-medium text-cyan-200/80 transition hover:border-cyan-400/30 hover:text-cyan-100 md:inline"
            >
              Trading OS — terminal in private beta
            </a>
            <Link
              href="/login"
              className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-tos-muted hover:bg-white/[0.08] hover:text-tos-text"
            >
              Log in
            </Link>
            <Link
              href="/login"
              className="axe-landing-cta inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-3.5 py-1.5 text-xs font-semibold text-[#04161B] shadow-[0_8px_22px_-8px_rgba(34,211,238,0.55)] transition hover:from-cyan-300 hover:to-teal-300"
            >
              Get started
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      {/* ─── live ticker ─── */}
      <div className="relative z-10 border-b border-white/[0.05] bg-white/[0.012] py-2">
        <div className="mx-auto max-w-[1400px] overflow-hidden px-4">
          <div className="flex w-max animate-axe-landing-marquee gap-0">
            {tickerRow.map((t, i) => (
              <div key={i} className="flex items-center gap-3 whitespace-nowrap px-4">
                <span className="font-mono text-[11px] font-semibold tracking-tight text-tos-text">
                  {t.s}
                </span>
                <span className="font-mono text-[11px] text-tos-muted">{t.p}</span>
                <span
                  className={`flex items-center gap-0.5 font-mono text-[11px] font-semibold ${
                    t.up ? "text-cyan-300/95" : "text-rose-300/95"
                  }`}
                >
                  {t.c}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── HERO ─── */}
      <section
        className="relative overflow-hidden"
        style={{ minHeight: "min(100svh, 920px)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(180deg, rgba(5,5,8,0.18) 0%, rgba(5,5,8,0.04) 45%, rgba(5,5,8,0.02) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,224,255,0.14) 0%, rgba(0,224,255,0.05) 100%)",
                border: "1px solid rgba(34,211,238,0.32)",
                boxShadow: "0 0 22px rgba(0,224,255,0.07)",
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
              </span>
              <span className="text-cyan-200/95">AXE Companion · live on MT5</span>
            </div>

            <h1 className="mt-7 max-w-[600px] text-[2.6rem] font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl md:text-[3.35rem]">
              The trader&apos;s phone.
              <br />
              <span className="axe-landing-heading-shimmer">
                Chart. Depth. News. Execute.
              </span>
            </h1>

            <p className="mt-5 max-w-[560px] text-[15px] leading-relaxed text-white/60 sm:text-base">
              AXE Companion is what an MT5 native phone app should feel like — calm dark canvas, auto-Fib /
              structure / OB / FVG that actually extend, a real depth ladder anchored on your broker&apos;s
              bid / ask, multi-source news cached to save credits, and a one-tap execution dock that talks
              straight to your account.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/login"
                className="axe-landing-cta inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-7 text-sm font-semibold text-[#04161B] shadow-[0_18px_44px_-14px_rgba(34,211,238,0.65)] transition hover:from-cyan-300 hover:to-teal-300"
              >
                Open AXE on web or PWA
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/welcome"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.04] px-5 text-sm font-medium text-cyan-100/90 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08]"
              >
                <Smartphone className="h-4 w-4 text-cyan-300/90" aria-hidden />
                Install as PWA
              </Link>
              <Link
                href="/chat"
                className="text-center text-xs text-white/40 transition hover:text-white/65 sm:text-left"
              >
                Already signed in? → Open AXE
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10.5px] uppercase tracking-[0.18em] text-white/45">
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-300" aria-hidden />
                MT5 ticks
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-300" aria-hidden />
                Polygon · Perigon · Finnhub
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-300" aria-hidden />
                Unusual Whales
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-300" aria-hidden />
                Supabase RLS
              </span>
            </div>

            <div className="mt-7 flex flex-wrap gap-1.5">
              {[
                "XAU/USD",
                "EUR/USD",
                "NAS100",
                "BTC/USD",
                "US30",
                "GBP/USD",
                "USD/JPY",
                "WTI",
                "SPX500",
              ].map((sym) => (
                <span
                  key={sym}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-white/65 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06] hover:text-cyan-100"
                >
                  {sym}
                </span>
              ))}
            </div>
          </div>

          {/* Interactive phone */}
          <div className="relative flex w-full justify-center lg:justify-end">
            <LandingHeroPhone />
          </div>
        </div>
      </section>

      {/* ─── strip: what cycles in the hero ─── */}
      <section className="relative z-10 border-y border-white/[0.04] bg-white/[0.012] px-5 py-7">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 md:grid-cols-5">
          {SCREEN_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <div key={tab.id} className="flex items-start gap-2 rounded-xl px-2 py-1.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-cyan-400/22 bg-cyan-400/[0.06]">
                  <Icon className="h-3.5 w-3.5 text-cyan-200" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/85">
                    {tab.label}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-tos-muted">{tab.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── quote ─── */}
      <section className="relative z-10 px-5 py-10">
        <p className="mx-auto max-w-3xl text-center text-sm italic leading-relaxed text-white/45 md:text-base">
          &ldquo;The same calm dark canvas as Trading OS, the same execution model as MT5, the same brain that
          journals what you actually did. AXE Companion is the phone-first half of one trading workspace —
          not another second-screen dashboard.&rdquo;
        </p>
      </section>

      {/* ─── features ─── */}
      <section className="relative z-10 border-t border-white/[0.04] px-5 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.04] px-2.5 py-1 text-[11px] font-medium text-cyan-200/95">
            <Wand2 className="h-3 w-3 text-cyan-300" aria-hidden />
            Built for real accounts
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Native trader feel, calmly.
            <br />
            <span className="axe-landing-heading-shimmer">
              Every tool you reach for is one tap away.
            </span>
          </h2>
          <p className="mb-12 max-w-2xl text-sm text-tos-muted md:text-base">
            Each tile below is something AXE actually does today — not a roadmap. We chose Lightweight Charts
            for the same reason MT5 traders trust their terminal: a steady canvas, real ticks, indicators that
            mean what they say.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_FEATURES.map(({ title, desc, Icon, color }) => (
              <div key={title} className="axe-landing-card-glow p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                  <Icon className={`h-5 w-5 ${color}`} aria-hidden />
                </div>
                <h3 className="mb-1.5 text-base font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-tos-muted">{desc}</p>
              </div>
            ))}
          </div>

          {/* Trading OS callout */}
          <div className="mx-auto mt-14 max-w-4xl rounded-2xl border border-cyan-400/22 bg-cyan-400/[0.05] p-8 md:p-10">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100/95">
                <Layout className="h-3 w-3 text-cyan-300" aria-hidden />
                Trading OS — desktop terminal
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/55">
                Private beta
              </span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-white md:text-2xl">
              The same brain on the desk you trade from.{" "}
              <span className="axe-landing-heading-shimmer">One workspace.</span>
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-white/65 md:text-base">
              AXE Companion is the phone-first OS — chart, depth, news, intel, execution, journal, AXE — and
              it&apos;s standalone today. Trading OS is the desktop terminal that lights up the same Supabase
              account on a multi-monitor desk: live charts, multi-source intelligence, alerts, execution
              workflows, watchlists. One login. One memory. One trading brain on phone and on desk.
            </p>
            <p className="mt-4 text-sm font-semibold text-cyan-100/95">
              AXE Companion is the brain in your pocket. Trading OS is the desk it plugs into.
            </p>
          </div>

          <div className="relative mt-8 overflow-hidden rounded-2xl border border-cyan-400/15 bg-gradient-to-r from-cyan-400/[0.04] via-cyan-400/[0.015] to-transparent p-6 md:p-8">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-400/[0.05] blur-[72px]" />
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <Radio className="mt-0.5 h-6 w-6 shrink-0 text-cyan-300/85" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold text-white">MT5 link — safe, revocable, hashed</h3>
                  <p className="mt-1 max-w-2xl text-sm text-tos-muted">
                    Recommended path: in-app cloud MT5 connection from{" "}
                    <span className="text-tos-text">Accounts</span>. Advanced: create a per-account link
                    token and paste it into your EA / bridge — only a hash is stored server-side, you can
                    revoke any time.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-4 py-2 text-center text-xs font-medium text-cyan-100/95 transition hover:border-cyan-300/45 hover:bg-cyan-300/[0.10]"
              >
                Open Accounts after login
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── pricing ─── */}
      <section className="relative z-10 border-t border-white/[0.04] px-5 py-14 md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-bold text-white md:text-4xl">Simple pricing</h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-sm text-tos-muted">
            AXE launches with early access. The free tier is the full UX — Pro just lifts the chat ceiling
            and unlocks the higher-end provider mix when we wire billing in-app.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="axe-landing-card-glow p-8">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium uppercase tracking-widest text-tos-dim">Free</h3>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/65">
                  Always
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold text-white">€0</p>
              <ul className="mt-4 space-y-2 text-sm text-tos-muted">
                <li>Full chart, depth, news, intel, execution UX</li>
                <li>Demo account on live ticks — paper-trade instantly</li>
                <li>20 AXE chat sends per day (UTC midnight reset)</li>
                <li>Same Supabase spine as Trading OS when you use both</li>
              </ul>
              <Link
                href="/login"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-5 text-xs font-medium text-white transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06] hover:text-cyan-100"
              >
                Start free
              </Link>
            </div>
            <div className="axe-landing-card-glow p-8 ring-1 ring-cyan-400/25">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium uppercase tracking-widest text-cyan-200/90">Pro</h3>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200/95">
                  Recommended
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold text-white">~€19/mo</p>
              <ul className="mt-4 space-y-2 text-sm text-tos-muted">
                <li>Unlimited AXE sends (reasonable fair use)</li>
                <li>Higher-priority Polygon news refresh</li>
                <li>Live execution unlocked behind master-password</li>
                <li>Billed via Stripe when in-app checkout lights up</li>
              </ul>
              <Link
                href="/login"
                className="axe-landing-cta mt-6 inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-5 text-xs font-semibold text-[#04161B] shadow-[0_10px_30px_-10px_rgba(34,211,238,0.55)] transition hover:from-cyan-300 hover:to-teal-300"
              >
                Get started
              </Link>
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-2xl px-2 text-center text-[10px] leading-relaxed text-tos-dim">
            {LEGAL_COPY.tradingShort} {LEGAL_COPY.pricing}
          </p>

          <div className="mx-auto mt-14 max-w-2xl" id="waitlist">
            <LandingWaitlist />
          </div>

          <div className="mx-auto mt-14 max-w-3xl">
            <h3 className="mb-4 text-center text-lg font-semibold text-white">Open on your phone</h3>
            <LandingOpenAppQr />
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="relative z-10 border-t border-white/[0.04] px-5 py-14 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center justify-center gap-2">
            <Compass className="h-5 w-5 text-cyan-300/85" aria-hidden />
            <h2 className="text-center text-2xl font-bold text-white md:text-3xl">FAQ</h2>
          </div>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="axe-landing-card-glow group px-5 py-1 open:bg-white/[0.04]"
              >
                <summary className="cursor-pointer list-none py-3 text-sm font-medium text-white/90 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="group-open:text-cyan-300/95">{item.q}</span>
                </summary>
                <p className="border-t border-white/[0.06] pb-3 pt-2 text-sm leading-relaxed text-tos-muted">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── final CTA ─── */}
      <section className="relative z-10 border-t border-white/[0.04] px-5 py-14">
        <div className="axe-landing-card-glow mx-auto max-w-3xl p-10 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/22 bg-cyan-400/[0.06] px-3 py-1 text-[11px] font-medium text-cyan-100/95">
            <Target className="h-3 w-3 text-cyan-300" aria-hidden />
            Ready to trade
          </div>
          <p className="text-lg font-semibold text-white md:text-xl">
            Open AXE on the phone you actually trade on.
          </p>
          <p className="mt-2 max-w-xl text-sm text-tos-muted">
            Free to start. Demo account spins up instantly on live ticks. Connect MT5 when you&apos;re ready
            to go live — same Supabase login carries over to Trading OS on desktop the moment it leaves
            private beta.
          </p>
          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="axe-landing-cta inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-8 text-sm font-semibold text-[#04161B] shadow-[0_18px_44px_-14px_rgba(34,211,238,0.55)] transition hover:from-cyan-300 hover:to-teal-300"
            >
              Get started
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/welcome"
              className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-300/22 bg-cyan-300/[0.04] px-8 text-sm font-medium text-cyan-100/90 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08]"
            >
              PWA install
            </Link>
          </div>
        </div>
      </section>

      <ComplianceSiteFooter
        className="relative z-10"
        tagline="AXE Companion OS · Algorithmic insights & technical analysis tool"
      />
    </div>
  );
}
