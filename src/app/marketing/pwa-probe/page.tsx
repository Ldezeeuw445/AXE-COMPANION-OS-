import type { Metadata } from "next";
import { MobileShell } from "@/components/shell/MobileShell";
import { readActiveSessionCookie, readShellViewportCookie } from "@/lib/session/readActiveSession.server";
import { PwaProbeScreen } from "./PwaProbeScreen";

export const metadata: Metadata = {
  title: "PWA stale probe",
  robots: { index: false, follow: false },
};

export default async function PwaProbePage() {
  const [initialSession, initialViewport] = await Promise.all([
    readActiveSessionCookie(),
    readShellViewportCookie(),
  ]);

  return (
    <MobileShell
      initialSession={{
        ...initialSession,
        accountId: initialSession.accountId ?? "probe-acct",
        accountLabel: initialSession.accountLabel ?? "Probe Live",
        accountType: initialSession.accountType === "unknown" ? "live" : initialSession.accountType,
        symbol: initialSession.symbol ?? "XAUUSD",
        lastTab: "markets",
      }}
      initialViewport={initialViewport}
    >
      <PwaProbeScreen />
    </MobileShell>
  );
}
