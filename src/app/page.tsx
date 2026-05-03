import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AXE Companion — jouw trading-assistent",
  description:
    "Persoonlijke AI voor traders: chat, alerts, journal en context — ook zonder desktop terminal.",
};

export default function HomeLandingPage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#06070a] px-6 py-14 pb-28 text-tos-text">
      <div
        className="pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      >
        <div
          className="rounded-[50%]"
          style={{
            width: 480,
            height: 200,
            background:
              "radial-gradient(ellipse at center, rgba(46,196,182,0.14) 0%, transparent 72%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-lg">
        <Image
          src="/axe-companion-wordmark.png"
          alt="AXE Companion"
          width={420}
          height={80}
          priority
          unoptimized
          className="mx-auto h-auto w-[min(100%,280px)] object-contain"
          style={{ mixBlendMode: "screen" }}
        />

        <p className="mt-6 text-center text-base leading-relaxed text-tos-muted">
          Een <strong className="font-semibold text-tos-text">echte AI-assistent</strong> voor je trades:
          scherp, direct, met geheugen en kennis — op je telefoon of in de browser.{" "}
          <span className="text-tos-dim">Geen Trading OS nodig om te starten.</span>
        </p>

        <ul className="mt-8 space-y-3 text-sm text-tos-muted">
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-tos-accent-cyan">✓</span>
            <span>Chat met AXE: levels, psychologie, setup-review, notities.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-tos-accent-cyan">✓</span>
            <span>Alerts en journal in dezelfde app — jij beheert ze zelf.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-tos-accent-cyan">✓</span>
            <span>Optioneel: broker/MT5 koppelen als je later live data wilt syncen.</span>
          </li>
        </ul>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-2xl bg-gradient-to-r from-tos-warm/90 to-teal-500/90 py-3.5 text-center text-sm font-semibold text-[#06070a] shadow-lg shadow-teal-900/30"
          >
            Inloggen of account maken
          </Link>
          <Link
            href="/welcome"
            className="rounded-2xl border border-white/15 py-3 text-center text-sm font-medium text-tos-text hover:bg-white/5"
          >
            App op je telefoon (PWA) — QR & uitleg
          </Link>
        </div>

        <p className="mt-10 text-center text-[11px] leading-relaxed text-tos-dim">
          Gebruik je wél Trading OS op desktop? Zelfde Supabase-account — context en
          accounts sluiten aan waar je ze al hebt.
        </p>
      </div>
    </div>
  );
}
