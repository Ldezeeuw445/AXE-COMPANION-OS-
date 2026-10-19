import { Suspense } from "react";
import { MobileShell } from "@/components/shell/MobileShell";
import { EmbedDemoFlags } from "@/components/shell/EmbedDemoFlags";
import { readActiveSessionCookie, readShellViewportCookie } from "@/lib/session/readActiveSession.server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [initialSession, initialViewport] = await Promise.all([
    readActiveSessionCookie(),
    readShellViewportCookie(),
  ]);

  return (
    <>
      <Suspense fallback={null}>
        <EmbedDemoFlags />
      </Suspense>
      <MobileShell initialSession={initialSession} initialViewport={initialViewport}>
        {children}
      </MobileShell>
    </>
  );
}
