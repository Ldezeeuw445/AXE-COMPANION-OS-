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
  title: "AXE Companion OS — jouw trading-assistent",
  description:
    "Chat, alerts, journal, vault en live broker-context — dezelfde Supabase als Trading OS, ook op je telefoon.",
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
    title: "Chat met context",
    desc: "AXE kent je sessie-brief, watchlist en (optioneel) live account — minder herhalen, scherpere antwoorden.",
    Icon: LineChart,
    color: "text-emerald-400",
  },
  {
    title: "Alerts & journal",
    desc: "Zelf meldingen bijhouden en trades labelen in hetzelfde ledger als op de webterminal.",
    Icon: Radio,
    color: "text-sky-400",
  },
  {
    title: "Vault & acties",
    desc: "Notities, screenshots en guarded approvals — één stack voor desktop en mobiel.",
    Icon: Database,
    color: "text-amber-400",
  },
  {
    title: "Leren & cockpit",
    desc: "Alignment en setup-stats — dezelfde leer-laag als je gewend bent van Trading OS.",
    Icon: Brain,
    color: "text-violet-400",
  },
  {
    title: "Multi-account",
    desc: "Koppel MT5 via een eenmalige link-token naar de ingest-bridge; kies welk account actief is.",
    Icon: Target,
    color: "text-teal-400",
  },
  {
    title: "Supabase sync",
    desc: "Eén database: chat, geheugen, alerts en brokerdata blijven realtime gelijk met Trading OS.",
    Icon: Shield,
    color: "text-emerald-400/80",
  },
];

const FAQ = [
  {
    q: "Waar vul ik de link-token in?",
    a: "Niet in deze app. Je plakt de token in je MT5 Expert Advisor of bridge-script die trades en account-snapshots naar de Supabase Edge-functie post. Daarna verschijnen trades en live stats automatisch — zie Accounts na het aanmaken van een token.",
  },
  {
    q: "Heb ik Trading OS op desktop nodig?",
    a: "Nee om te starten: chat, alerts en journal werken standalone. Met dezelfde Supabase-login sluit alles naadloos aan als je wél de terminal gebruikt.",
  },
  {
    q: "Is dit een app-store app?",
    a: "Je kunt de site als PWA op je beginscherm zetten (Safari / Chrome) — geen App Store nodig voor de kernflow.",
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
              Inloggen
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400"
            >
              Starten
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
              <span className="text-emerald-300/95">Live stack · zelfde Supabase als Trading OS</span>
            </div>

            <h1 className="mt-7 max-w-[560px] text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl md:text-[3.15rem]">
              Jouw AXE-assistent,
              <br />
              <span className="axe-landing-heading-shimmer">overal waar je trade.</span>
            </h1>

            <p className="mt-5 max-w-[520px] text-sm leading-relaxed text-white/55 sm:text-base">
              Chat, alerts, journal, vault en broker-sync in één donkere, rustige UI — bewust in de lijn van{" "}
              <span className="text-white/75">Trading OS</span>: diepte, teal-accenten, geen speelse AI-slop.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-semibold text-black shadow-lg shadow-emerald-900/25 hover:bg-emerald-400"
              >
                Inloggen of account maken
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/welcome"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/14 bg-white/[0.04] px-5 text-sm font-medium text-white/85 hover:bg-white/[0.08]"
              >
                <Smartphone className="mr-2 h-4 w-4 text-cyan-400/90" aria-hidden />
                PWA op je telefoon
              </Link>
              <Link
                href="/chat"
                className="text-center text-xs text-white/40 hover:text-white/65 sm:text-left"
              >
                Al ingelogd? → Chat openen
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
            Gebouwd voor serieuze traders
          </div>
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
            Alles wat je op de terminal mist
            <br />
            <span className="axe-landing-heading-shimmer">op mobiel en web.</span>
          </h2>
          <p className="mb-12 max-w-xl text-sm text-tos-muted md:text-base">
            Geen tweede identiteit: login met hetzelfde Supabase-account als Trading OS. Data, alerts en geheugen
            lopen synchroon.
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
                  <h3 className="text-base font-semibold text-white">MT5-link — veilig en herroepbaar</h3>
                  <p className="mt-1 max-w-2xl text-sm text-tos-muted">
                    Je maakt een token onder Accounts. Die gaat in je EA/bridge (niet in Settings). Alleen een hash
                    staat in de database; fills komen binnen via de ingest-functie.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="shrink-0 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-center text-xs font-medium text-white hover:bg-white/10"
              >
                Accounts openen na login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.04] px-5 py-14 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-bold text-white md:text-3xl">Veelgestelde vragen</h2>
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
          <p className="text-sm font-medium text-white">Klaar om AXE mee te nemen?</p>
          <p className="mt-2 text-xs text-tos-muted">
            Zelfde stack als Trading OS — minder context verliezen tussen schermen.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-8 text-sm font-semibold text-black hover:bg-emerald-400"
            >
              Start nu
            </Link>
            <Link
              href="/welcome"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-8 text-sm font-medium text-white/85 hover:bg-white/[0.06]"
            >
              PWA-installatie
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.04] px-5 py-8 text-center text-[11px] text-tos-dim">
        AXE Companion OS · niet-financieel advies · trade verantwoord
      </footer>
    </div>
  );
}
