import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart2,
  Brain,
  ChevronRight,
  Layout,
  LineChart,
  Radio,
  Shield,
  Smartphone,
  Target,
  Zap,
} from "lucide-react";
import { LandingOpenAppQr } from "@/components/marketing/LandingOpenAppQr";
import { LandingWaitlist } from "@/components/marketing/LandingWaitlist";
import { LegalNavLinks } from "@/components/legal/LegalNavLinks";

export const metadata: Metadata = {
  title: "AXE Companion — your trading copilot",
  description:
    "Standalone AI trading assistant: chat, accounts, journal, and memory on one Supabase spine. Trading OS is the upcoming premium terminal — AXE Companion is the brain; Trading OS is the terminal.",
};

const TICKER = [
  { s: "XAUUSD", p: "3,342.12", up: true, c: "+0.42%" },
  { s: "EURUSD", p: "1.0842", up: false, c: "-0.08%" },
  { s: "GBPJPY", p: "196.42", up: true, c: "+0.15%" },
  { s: "US500", p: "5,842.1", up: true, c: "+0.22%" },
  { s: "BTCUSD", p: "98,420", up: false, c: "-0.31%" },
];

const LANDING_FEATURES = [
  {
    title: "Broker trade history",
    desc: "Closed trades sync into your private ledger with idempotent upserts — no double-counting when the bridge retries.",
    Icon: BarChart2,
    color: "text-emerald-400",
  },
  {
    title: "MT5 bridge (Phase 1)",
    desc: "Per-account link token, revocable later. Ingest only — no execution from AXE in v1.",
    Icon: Radio,
    color: "text-sky-400",
  },
  {
    title: "Multi-account",
    desc: "Funded, demo, live, multiple brokers — pick an active account and keep analytics scoped to it.",
    Icon: Target,
    color: "text-amber-400",
  },
  {
    title: "AXE memory & context",
    desc: "Pair-aware notes and recall so follow-ups stay grounded in what you actually did in the market.",
    Icon: Brain,
    color: "text-violet-400",
  },
  {
    title: "Five-tap journal labels",
    desc: "A+ setup through rule break — fast enough to use every session without writing essays.",
    Icon: Zap,
    color: "text-red-400",
  },
  {
    title: "Analytics that match the book",
    desc: "Win rate, profit factor, P&L, and calendar views driven from the same broker rows you journal.",
    Icon: LineChart,
    color: "text-cyan-400",
  },
  {
    title: "Trading OS terminal path",
    desc: "Ship AXE standalone first. Trading OS — our upcoming premium trading terminal — plugs into the same accounts, journal, and AXE intelligence when you want the full desk.",
    Icon: Layout,
    color: "text-indigo-400",
  },
  {
    title: "RLS + Supabase",
    desc: "Accounts, trades, and labels are scoped per user in Postgres — not mixed across workspaces.",
    Icon: Shield,
    color: "text-teal-400",
  },
];

const FAQ = [
  {
    q: "Where do I paste the link token?",
    a: "Not inside this app. Put it in your MT5 Expert Advisor or bridge script that POSTs trades and snapshots to the Supabase Edge function. After the first successful post, trades and live stats flow automatically — see Accounts right after you create a token.",
  },
  {
    q: "Do I need Trading OS on desktop?",
    a: "No to get started: chat, alerts, accounts, journal, and memory work standalone. Trading OS is our upcoming premium terminal (charts, intelligence, alerts, execution desk). With the same Supabase login, one account and one memory carry across both when it launches.",
  },
  {
    q: "Is this an App Store app?",
    a: "You can install the site as a PWA on your home screen (Safari / Chrome) — no App Store required for the core flow.",
  },
  {
    q: "What is Trading OS, and how does it relate to AXE?",
    a: "Trading OS is our upcoming premium trading terminal — live charts, market intelligence, alerts, execution workspace, watchlists, and multi-source data, with AXE embedded as the intelligence layer. AXE Companion ships first as a standalone assistant. Same Supabase user, auth, broker accounts, trades, journal, notes, and AXE memory — not a separate data island.",
  },
  {
    q: "Do I need a News tab in AXE Companion to get market or news context in chat?",
    a: "No. A News tab is a terminal screen, not the source of truth. AXE can use the same shared engine and Supabase-backed context when you ask about markets or headlines — even without a dedicated News page in the mobile UI.",
  },
];

export default function HomeLandingPage() {
  const row = [...TICKER, ...TICKER];

  return (
    <div className="axe-landing-matte-bg relative min-h-dvh text-tos-text">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050508]/85 backdrop-blur-md">
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
              className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white/80 md:inline"
            >
              Trading OS — coming soon
            </a>
            <Link
              href="/login"
              className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-tos-muted hover:bg-white/[0.08] hover:text-tos-text"
            >
              Log in
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <div className="border-b border-white/[0.04] bg-white/[0.015] py-2">
        <div className="mx-auto max-w-[1400px] overflow-hidden px-4">
          <div className="flex w-max animate-axe-landing-marquee gap-0">
            {row.map((t, i) => (
              <div key={i} className="flex items-center gap-3 whitespace-nowrap px-4">
                <span className="font-mono text-[11px] font-semibold text-tos-text">{t.s}</span>
                <span className="font-mono text-[11px] text-tos-muted">{t.p}</span>
                <span
                  className={`flex items-center gap-0.5 font-mono text-[11px] font-semibold ${
                    t.up ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {t.c}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section
        className="relative overflow-hidden"
        style={{
          minHeight: "min(100svh, 900px)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(180deg, rgba(5,5,8,0.2) 0%, rgba(5,5,8,0.06) 45%, rgba(5,5,8,0.02) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 md:pt-14 lg:grid-cols-[1fr_0.92fr] lg:gap-10">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
              style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(16,185,129,0.08) 100%)",
                border: "1px solid rgba(34,197,94,0.32)",
                boxShadow: "0 0 22px rgba(34,197,94,0.1)",
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-emerald-300/95">AXE Companion</span>
            </div>

            <h1 className="mt-7 max-w-[560px] text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl md:text-[3.15rem]">
              Your trades, your journal,
              <br />
              <span className="axe-landing-heading-shimmer">your intelligence.</span>
            </h1>

            <p className="mt-5 max-w-[520px] text-sm leading-relaxed text-white/55 sm:text-base">
              AXE connects broker history, quick journal labels, and private memory into one workspace — powered by the
              same Supabase account and shared engine layer as{" "}
              <span className="text-white/80">Trading OS</span>, our upcoming premium trading terminal (live charts,
              intelligence, alerts, execution desk).
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-semibold text-black shadow-lg shadow-emerald-900/25 hover:bg-emerald-400"
              >
                Log in or create account
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/welcome"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/14 bg-white/[0.04] px-5 text-sm font-medium text-white/85 hover:bg-white/[0.08]"
              >
                <Smartphone className="mr-2 h-4 w-4 text-cyan-400/90" aria-hidden />
                Phone (PWA)
              </Link>
              <Link
                href="/chat"
                className="text-center text-xs text-white/40 hover:text-white/65 sm:text-left"
              >
                Already signed in? → Open chat
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-2">
              {["XAU/USD", "EUR/USD", "NAS100", "BTC/USD", "US30", "GBP/USD", "USD/JPY", "WTI", "SPX500"].map(
                (sym) => (
                  <span
                    key={sym}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-white/65"
                  >
                    {sym}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="relative flex w-full justify-center lg:justify-end">
            <div
              className="marketing-tilt relative rounded-[36px] border border-white/10 bg-gradient-to-b from-[#12141c] to-[#07080c] p-2 shadow-2xl"
              style={{
                boxShadow:
                  "0 40px 120px rgba(0,0,0,0.55), 0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
              }}
            >
              <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-6 w-[88px] -translate-x-1/2 rounded-b-[14px] border-b border-white/[0.07] bg-[#0a0b10]" />
              <Image
                src="/marketing/marketing-chat.png"
                alt="AXE Companion chat"
                width={280}
                height={560}
                className="block w-[min(100%,260px)] rounded-[28px] sm:w-[280px]"
                priority
              />
            </div>
            <div
              className="pointer-events-none absolute -bottom-6 left-1/2 h-20 w-[65%] max-w-[300px] -translate-x-1/2 rounded-full opacity-60"
              style={{
                background: "radial-gradient(ellipse at center, rgba(16,185,129,0.2), transparent 72%)",
                filter: "blur(20px)",
              }}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.04] px-5 py-10">
        <p className="mx-auto max-w-3xl text-center text-sm italic leading-relaxed text-white/40">
          &ldquo;Built for traders who want clarity without another noisy dashboard. AXE focuses on what happened in
          your account, why it mattered, and what to watch next. When Trading OS launches, the same memory and context
          carry into the full terminal experience — for now, AXE Companion is the brain you use first.&rdquo;
        </p>
      </section>

      <section className="border-t border-white/[0.04] px-5 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-tos-muted">
            <Zap className="h-3 w-3 text-emerald-400" aria-hidden />
            Built for real accounts
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Journal that writes itself.
            <br />
            <span className="axe-landing-heading-shimmer">Insights you can trust.</span>
          </h2>
          <p className="mb-12 max-w-xl text-sm text-tos-muted md:text-base">
            Trades land from MT5 via a secure ingest token. You tag outcomes in one tap. Analytics and memory stay tied
            to the account you select.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_FEATURES.map(({ title, desc, Icon, color }) => (
              <div key={title} className="axe-landing-card p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                  <Icon className={`h-5 w-5 ${color}`} aria-hidden />
                </div>
                <h3 className="mb-1.5 text-base font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-tos-muted">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-12 max-w-4xl rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-8 md:p-10">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100/95">
              Trading OS terminal — coming soon
            </div>
            <h3 className="text-xl font-bold text-white md:text-2xl">
              Standalone companion today.{" "}
              <span className="axe-landing-heading-shimmer">Full trading terminal tomorrow.</span>
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-white/60 md:text-base">
              AXE Companion works as a standalone AI trading assistant now — chat, accounts, journal, notes, and memory
              on one Supabase spine. Trading OS is the upcoming premium terminal that brings AXE into live charts, market
              intelligence, alerts, execution workflows, and a full multi-source desk. One account, one memory, one
              trading brain across both.
            </p>
            <p className="mt-4 text-sm font-semibold text-white/90">
              AXE Companion is the brain. Trading OS is the terminal.
            </p>
          </div>

          <div className="relative mt-8 overflow-hidden rounded-2xl border border-emerald-500/18 bg-gradient-to-r from-emerald-500/[0.05] via-emerald-500/[0.02] to-transparent p-6 md:p-8">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-500/[0.04] blur-[72px]" />
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <BarChart2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400/85" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold text-white">MT5 link — safe and revocable</h3>
                  <p className="mt-1 max-w-2xl text-sm text-tos-muted">
                    Recommended: in-app cloud MT5 (read-only analytics) from Accounts when available. Advanced: create a
                    link token under Accounts and paste it into your EA or bridge that POSTs to{" "}
                    <code className="rounded bg-black/40 px-1 text-[10px] text-tos-text">axe-mt5-ingest</code> — only a
                    hash is stored server-side.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-center text-xs font-medium text-white hover:bg-white/10"
              >
                Open Accounts after login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.04] px-5 py-14 md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-bold text-white md:text-4xl">Simple pricing</h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-sm text-tos-muted">
            AXE launches with early access. Public tiers will ship with billing — join the waitlist for AXE and updates
            on Trading OS, our upcoming premium trading terminal.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="axe-landing-card p-8">
              <h3 className="text-xs font-medium uppercase tracking-widest text-tos-dim">Free</h3>
              <p className="mt-2 text-3xl font-semibold text-white">€0</p>
              <ul className="mt-4 space-y-2 text-sm text-tos-muted">
                <li>Full product UX</li>
                <li>20 chat sends per day (UTC midnight reset)</li>
                <li>Same Supabase spine as Trading OS when you use both</li>
              </ul>
              <Link
                href="/login"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-white/12 px-5 text-xs font-medium text-white hover:bg-white/[0.06]"
              >
                Start free
              </Link>
            </div>
            <div className="axe-landing-card border-emerald-500/20 p-8 ring-1 ring-emerald-500/15">
              <h3 className="text-xs font-medium uppercase tracking-widest text-emerald-400/90">Pro</h3>
              <p className="mt-2 text-3xl font-semibold text-white">~€19/mo</p>
              <ul className="mt-4 space-y-2 text-sm text-tos-muted">
                <li>Unlimited sends (reasonable fair use)</li>
                <li>Same features as Free</li>
                <li>Billed via Stripe when checkout is configured in-app</li>
              </ul>
              <Link
                href="/login"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-emerald-500 px-5 text-xs font-semibold text-black hover:bg-emerald-400"
              >
                Get started
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-2xl">
            <LandingWaitlist />
          </div>

          <div className="mx-auto mt-14 max-w-3xl">
            <h3 className="mb-4 text-center text-lg font-semibold text-white">Open on your phone</h3>
            <LandingOpenAppQr />
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.04] px-5 py-14 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-white md:text-3xl">FAQ</h2>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details key={item.q} className="axe-landing-card group px-4 py-1 open:bg-white/[0.04]">
                <summary className="cursor-pointer list-none py-3 text-sm font-medium text-white/90 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="group-open:text-emerald-400/95">{item.q}</span>
                </summary>
                <p className="border-t border-white/[0.06] pb-3 pt-2 text-sm leading-relaxed text-tos-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.04] px-5 py-12">
        <div className="axe-landing-card mx-auto max-w-3xl p-8 text-center">
          <p className="text-sm font-medium text-white">Trading OS is coming soon</p>
          <p className="mt-2 text-xs text-tos-muted">
            A premium trading terminal powered by the same AXE intelligence layer — same account when you use both.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-8 text-sm font-semibold text-black hover:bg-emerald-400"
            >
              Get started
            </Link>
            <Link
              href="/welcome"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-8 text-sm font-medium text-white/85 hover:bg-white/[0.06]"
            >
              PWA install
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] px-5 py-8 text-center text-[11px] text-tos-dim">
        <p>AXE Companion OS · not financial advice · trade responsibly</p>
        <p className="mt-2 text-tos-muted">
          Trading OS — upcoming premium terminal · same Supabase spine ·{" "}
          <a href="#waitlist" className="text-cyan-400/80 underline-offset-2 hover:underline">
            Join the Trading OS waitlist
          </a>
        </p>
        <LegalNavLinks className="mt-6" />
      </footer>
    </div>
  );
}
