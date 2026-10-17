import type { Metadata } from "next";
import { MobileShell } from "@/components/shell/MobileShell";
import { readActiveSessionCookie, readShellViewportCookie } from "@/lib/session/readActiveSession.server";
import { ShellProbeScreen } from "./ShellProbeScreen";

export const metadata: Metadata = {
  title: "Shell probe",
  robots: { index: false, follow: false },
};

export default async function ShellProbeHomePage() {
  const [initialSession, initialViewport] = await Promise.all([
    readActiveSessionCookie(),
    readShellViewportCookie(),
  ]);

  return (
    <MobileShell
      initialSession={{ ...initialSession, lastTab: "home" }}
      initialViewport={initialViewport}
    >
      <ShellProbeScreen tab="home" />
    </MobileShell>
  );
}
