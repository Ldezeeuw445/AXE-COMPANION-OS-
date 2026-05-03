import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart2,
  Brain,
  ChevronRight,
  Database,
  LineChart,
  Radio,
  Shield,
  Smartphone,
  Target,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "AXE Companion OS — your trading copilot",
  description:
    "Chat, alerts, journal, vault, and optional live broker context — same Supabase as Trading OS, on your phone too.",
};

const TICKER = [
  { s: "XAUUSD", p: "3,342.12", up: true, c: "+0.42%" },
  { s: "EURUSD", p: "1.0842", up: false, c: "-0.08%" },
  { s: "GBPJPY", p: "196.42", up: true, c: "+0.15%" },
  { s: "US500", p: "5,842.1", up: true, c: "+0.22%" },
  { s: "BTCUSD", p: "98,420", up: false, c: "-0.31%" },
];

const FEATURES = [
  {
    title: "Context-rich chat",
    desc: "AXE reads your session brief, watchlist, and optional live account — less repetition, sharper answers.",
    Icon: LineChart,
    color: "text-emerald-400",
  },
  {
    title: "Alerts & journal",
    desc: "Track what matters and label trades in the same ledger as the web terminal.",
    Icon: Radio,
    color: "text-sky-400",
  },
  {
    title: "Vault & actions",
    desc: "Notes, screenshots, and guarded approvals — one stack for desktop and mobile.",
    Icon: Database,
    color: "text-amber-400",
  },
  {
    title: "Learning & cockpit",
    desc: "Alignment and setup stats — the same learning layer you expect from Trading OS.",
    Icon: Brain,
    color: "text-violet-400",
  },
  {
    title: "Multi-account",
    desc: "Link MT5 with a one-time token to the ingest bridge; pick which account is active.",
    Icon: Target,
    color: "text-teal-400",
  },
  {
    title: "Supabase sync",
    desc: "One database: chat, memory, alerts, and broker data stay in sync with Trading OS in real time.",
    Icon: Shield,
    color: "text-emerald-400/80",
  },
];

const FAQ = [
  {
    q: "Where do I paste the link token?",
    a: "Not inside this app. Put it in your MT5 Expert Advisor or bridge script that POSTs trades and snapshots to the Supabase Edge function. After the first successful post, trades and live stats flow automatically — see Accounts right after you create a token.",
  },
  {
    q: "Do I need Trading OS on desktop?",
    a: "No to get started: chat, alerts, and journal work standalone. With the same Supabase login, everything lines up if you also use the terminal.",
  },
  {
    q: "Is this an App Store app?",
    a: "You can install the site as a PWA on your home screen (Safari / Chrome) — no App Store required for the core flow.",
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
              <span className="text-emerald-300/95">Live stack · same Supabase as Trading OS</span>
            </div>

            <h1 className="mt-7 max-w-[560px] text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl md:text-[3.15rem]">
              Your AXE copilot,
              <br />
              <span className="axe-landing-heading-shimmer">wherever you trade.</span>
            </h1>

            <p className="mt-5 max-w-[520px] text-sm leading-relaxed text-white/55 sm:text-base">
              Chat, alerts, journal, vault, and broker sync in one calm, dark UI — aligned with{" "}
              <span className="text-white/75">Trading OS</span>: depth, teal accents, no gimmicky AI chrome.
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
              {["XAUUSD", "EURUSD", "US500", "NAS100", "BTCUSD"].map((sym) => (
                <span
                  key={sym}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-white/65"
                >
                  {sym}
                </span>
              ))}
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

      <section className="border-t border-white/[0.04] px-5 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-tos-muted">
            <Zap className="h-3 w-3 text-emerald-400" aria-hidden />
            Built for serious traders
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
            What the terminal skips,
            <br />
            <span className="axe-landing-heading-shimmer">on mobile and web.</span>
          </h2>
          <p className="mb-12 max-w-xl text-sm text-tos-muted md:text-base">
            One identity: sign in with the same Supabase account as Trading OS. Data, alerts, and memory stay in sync.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, desc, Icon, color }) => (
              <div key={title} className="axe-landing-card p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                  <Icon className={`h-5 w-5 ${color}`} aria-hidden />
                </div>
                <h3 className="mb-1.5 text-base font-semibold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-tos-muted">{desc}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-8 overflow-hidden rounded-2xl border border-emerald-500/18 bg-gradient-to-r from-emerald-500/[0.05] via-emerald-500/[0.02] to-transparent p-6 md:p-8">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-500/[0.04] blur-[72px]" />
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <BarChart2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400/85" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold text-white">MT5 link — safe and revocable</h3>
                  <p className="mt-1 max-w-2xl text-sm text-tos-muted">
                    Create a token under Accounts. It lives in your EA or bridge (not in Settings). Only a hash is
                    stored; fills arrive through the ingest function.
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
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-white md:text-3xl">FAQ</h2>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="axe-landing-card group px-4 py-1 open:bg-white/[0.04]"
              >
                <summary className="cursor-pointer list-none py-3 text-sm font-medium text-white/90 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="group-open:text-emerald-400/95">{item.q}</span>
                </summary>
                <p className="border-t border-white/[0.06] pb-3 pt-2 text-sm leading-relaxed text-tos-muted">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.04] px-5 py-14">
        <div className="axe-landing-card mx-auto max-w-3xl p-8 text-center">
          <p className="text-sm font-medium text-white">Bring AXE with you</p>
          <p className="mt-2 text-xs text-tos-muted">
            Same stack as Trading OS — less context lost between screens.
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
        AXE Companion OS · not financial advice · trade responsibly
      </footer>
    </div>
  );
}
