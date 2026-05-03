import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { MarketingPhoneShell } from "@/components/marketing/MarketingPhoneShell";
import { MarketingOverviewScreen } from "@/components/marketing/screens/MarketingOverviewScreen";
import { MarketingStatsScreen } from "@/components/marketing/screens/MarketingStatsScreen";
import { MarketingChatScreen } from "@/components/marketing/screens/MarketingChatScreen";
import { MarketingAlertsScreen } from "@/components/marketing/screens/MarketingAlertsScreen";
import { MarketingVaultScreen } from "@/components/marketing/screens/MarketingVaultScreen";

export const metadata: Metadata = {
  title: "Marketing poster — TradingOS Companion",
  robots: { index: false, follow: false },
};

const SCALE = 0.72;
const INNER_W = 360;
const INNER_H = 780;
const CLIP_H = Math.round(INNER_H * SCALE);

function ScaledPhone({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      <MarketingPhoneShell tilt={false} frameClassName="w-[272px] max-w-[272px]">
        <div
          className="mx-auto overflow-hidden"
          style={{ width: 272, height: CLIP_H }}
        >
          <div
            className="flex justify-center"
            style={{ width: 272, height: CLIP_H }}
          >
            <div
              className="origin-top"
              style={{
                transform: `scale(${SCALE})`,
                transformOrigin: "top center",
                width: INNER_W,
              }}
            >
              <div className="w-[360px]">{children}</div>
            </div>
          </div>
        </div>
      </MarketingPhoneShell>
      <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-wider text-white/40">
        {label}
      </p>
    </div>
  );
}

export default function MarketingPosterPage() {
  return (
    <div
      className="min-h-dvh px-6 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12"
      data-marketing-shot="all"
      style={{
        background:
          "radial-gradient(ellipse 95% 60% at 50% -15%, rgba(201,162,39,0.12), transparent 55%), #030406",
      }}
    >
      <header className="mx-auto max-w-4xl text-center">
        <Image
          src="/axe-logo-companion.png"
          alt=""
          width={56}
          height={56}
          className="mx-auto h-14 w-14 object-contain"
        />
        <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.35em] text-tos-warm">
          TradingOS Companion
        </p>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
          Private command channel
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-xs text-white/50 sm:text-sm">
          Overview · performance · assistant · alerts · vault — one surface.
        </p>
      </header>

      <div className="mx-auto mt-10 flex max-w-[1180px] flex-col items-center gap-12 lg:mt-12 lg:gap-14">
        <div className="grid grid-cols-1 justify-items-center gap-10 sm:grid-cols-3 sm:gap-x-6 lg:gap-x-10">
          <ScaledPhone label="Overview">
            <MarketingOverviewScreen />
          </ScaledPhone>
          <ScaledPhone label="Performance">
            <MarketingStatsScreen />
          </ScaledPhone>
          <ScaledPhone label="Assistant">
            <MarketingChatScreen />
          </ScaledPhone>
        </div>
        <div className="flex flex-col flex-wrap items-center justify-center gap-10 sm:flex-row sm:gap-16 lg:gap-24">
          <ScaledPhone label="Alerts">
            <MarketingAlertsScreen />
          </ScaledPhone>
          <ScaledPhone label="Vault">
            <MarketingVaultScreen />
          </ScaledPhone>
        </div>
      </div>

      <p className="mx-auto mt-14 max-w-md text-center text-[10px] text-white/38">
        <Link
          href="/marketing/ui-premium"
          className="text-tos-warm underline decoration-tos-warm/35 underline-offset-2 hover:decoration-tos-warm"
        >
          Desktop command desk + AXE
        </Link>
        {" · "}
        <Link
          href="/marketing/screenshots"
          className="text-tos-warm underline decoration-tos-warm/35 underline-offset-2 hover:decoration-tos-warm"
        >
          Export frames
        </Link>
      </p>
    </div>
  );
}
