import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { MarketingPhoneShell } from "@/components/marketing/MarketingPhoneShell";
import { MarketingOverviewScreen } from "@/components/marketing/screens/MarketingOverviewScreen";
import { MarketingStatsScreen } from "@/components/marketing/screens/MarketingStatsScreen";
import { MarketingChatScreen } from "@/components/marketing/screens/MarketingChatScreen";
import { MarketingAlertsScreen } from "@/components/marketing/screens/MarketingAlertsScreen";
import { MarketingVaultScreen } from "@/components/marketing/screens/MarketingVaultScreen";

export const metadata: Metadata = {
  title: "Marketing screenshots — TradingOS Companion",
  robots: { index: false, follow: false },
};

function ShotBlock({
  kicker,
  title,
  hint,
  shotId,
  tilt,
  children,
}: {
  kicker: string;
  title: string;
  hint: string;
  shotId: string;
  tilt?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-12"
      aria-labelledby={`shot-${shotId}-title`}
    >
      <div className="max-w-md shrink-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-tos-warm">
          {kicker}
        </p>
        <h2
          id={`shot-${shotId}-title`}
          className="mt-2 text-xl font-bold tracking-tight text-white"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/55">{hint}</p>
      </div>
      <div className="flex-1 lg:pl-8">
        <MarketingPhoneShell shotId={shotId} tilt={tilt !== false}>
          {children}
        </MarketingPhoneShell>
      </div>
    </section>
  );
}

export default function MarketingScreenshotsPage() {
  return (
    <div
      className="relative min-h-dvh overflow-x-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 55% at 50% -8%, rgba(201,162,39,0.14), transparent 52%), #030406",
      }}
    >
      <div className="relative mx-auto max-w-6xl px-6 py-14 lg:px-10 lg:py-20">
        <header className="max-w-2xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-tos-warm">
            TradingOS Companion
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">
            Product frames
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            Static compositions for homepage and deck — same glass language as
            the shipping app.{" "}
            <Link
              href="/marketing/poster"
              className="text-tos-warm underline decoration-tos-warm/40 underline-offset-2 hover:decoration-tos-warm"
            >
              Combined poster
            </Link>
            {" · "}
            <Link
              href="/marketing/ui-premium"
              className="text-tos-warm underline decoration-tos-warm/40 underline-offset-2 hover:decoration-tos-warm"
            >
              Desktop command desk + AXE
            </Link>
            {" · "}Export PNGs with{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/80">
              npm run capture:marketing
            </code>{" "}
            (writes <code className="rounded bg-white/10 px-1 font-mono text-[11px] text-white/80">marketing-all.png</code> too; requires{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/80">
              npm run build && npm run start
            </code>{" "}
            in another process, or adjust the script URL).
          </p>
        </header>

        <div className="mt-20 flex flex-col gap-24 lg:gap-28">
          <ShotBlock
            kicker="01 · Overview"
            title="At-a-glance command post"
            hint="Alignment, pending reviews, vault depth, and a calm 30-day trace — paper book, risk-aware."
            shotId="overview"
          >
            <MarketingOverviewScreen />
          </ShotBlock>

          <ShotBlock
            kicker="02 · Performance"
            title="How alignment and size interact"
            hint="Fit score beside paper stats: kept setups, average R, drawdown cap language — no fantasy equity curve."
            shotId="stats"
          >
            <MarketingStatsScreen />
          </ShotBlock>

          <ShotBlock
            kicker="03 · Assistant"
            title="Private channel, pinned context"
            hint="Real levels, real invalidation wording — execution still waits on you."
            shotId="chat"
          >
            <MarketingChatScreen />
          </ShotBlock>

          <ShotBlock
            kicker="04 · Alerts"
            title="Terminal signal, phone-quiet clarity"
            hint="Price, risk, news — filtered like the product, not a social feed."
            shotId="alerts"
          >
            <MarketingAlertsScreen />
          </ShotBlock>

          <ShotBlock
            kicker="05 · Vault"
            title="Notes live next to screenshots"
            hint="Rules of engagement and chart grabs in one place — searchable later."
            shotId="vault"
          >
            <MarketingVaultScreen />
          </ShotBlock>
        </div>

        <footer className="mt-24 border-t border-white/10 pt-10 text-center text-[11px] text-white/40">
          Internal marketing asset · not linked from production navigation
        </footer>
      </div>
    </div>
  );
}
