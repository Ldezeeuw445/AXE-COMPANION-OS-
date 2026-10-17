import type { Metadata } from "next";
import { MobileShell } from "@/components/shell/MobileShell";
import { readActiveSessionCookie, readShellViewportCookie } from "@/lib/session/readActiveSession.server";
import { JournalProbeScreen } from "./JournalProbeScreen";

export const metadata: Metadata = {
  title: "Quick journal probe",
  robots: { index: false, follow: false },
};

export default async function JournalProbePage() {
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
        lastTab: "account",
      }}
      initialViewport={initialViewport}
    >
      <JournalProbeScreen />
    </MobileShell>
  );
}
