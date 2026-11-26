import type { Metadata } from "next";
import { MobileShell } from "@/components/shell/MobileShell";
import { readActiveSessionCookie, readShellViewportCookie } from "@/lib/session/readActiveSession.server";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { CockpitLearningSection } from "@/components/home/CockpitLearningSection";
import { HOME_PROBE_DATA } from "./homeProbeData";

export const metadata: Metadata = {
  title: "Home probe",
  robots: { index: false, follow: false },
};

export default async function HomeProbePage() {
  const [initialSession, initialViewport] = await Promise.all([
    readActiveSessionCookie(),
    readShellViewportCookie(),
  ]);

  return (
    <MobileShell
      initialSession={{
        ...initialSession,
        accountId: initialSession.accountId ?? "probe-ftmo",
        accountLabel: initialSession.accountLabel ?? "FTMO 100k",
        accountType: initialSession.accountType === "unknown" ? "prop" : initialSession.accountType,
        lastTab: "home",
      }}
      initialViewport={initialViewport}
    >
      <div data-testid="home-probe" data-home-shot="dashboard">
        <HomeDashboard data={HOME_PROBE_DATA} />
        <CockpitLearningSection
          badge="Probe"
          alignmentScore={78}
          signalCount={12}
          message="Screenshot fixture only. Production Home loads live accounts, trades, watchlist, alerts and news."
        >
          <p className="text-xs text-tos-muted">Full cockpit learning UI lives on /cockpit for signed-in users.</p>
        </CockpitLearningSection>
      </div>
    </MobileShell>
  );
}
