import type { Metadata } from "next";
import { MobileShell } from "@/components/shell/MobileShell";
import { readActiveSessionCookie, readShellViewportCookie } from "@/lib/session/readActiveSession.server";
import { BrokerConnectProbeScreen } from "./BrokerConnectProbeScreen";

export const metadata: Metadata = {
  title: "Broker connect probe",
  robots: { index: false, follow: false },
};

export default async function BrokerConnectProbePage() {
  const [initialSession, initialViewport] = await Promise.all([
    readActiveSessionCookie(),
    readShellViewportCookie(),
  ]);

  return (
    <MobileShell
      initialSession={{ ...initialSession, lastTab: "account" }}
      initialViewport={initialViewport}
    >
      <BrokerConnectProbeScreen />
    </MobileShell>
  );
}
