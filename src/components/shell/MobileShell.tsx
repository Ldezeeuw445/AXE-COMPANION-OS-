import type { ReactNode } from "react";
import { AppChrome } from "@/components/shell/AppChrome";
import { ActiveSessionProvider } from "@/components/session/ActiveSessionProvider";
import { DEFAULT_ACTIVE_SESSION, type ActiveSessionState } from "@/lib/session/activeSession";
import type { ShellViewport } from "@/lib/viewport/shellViewportServer";

type MobileShellProps = {
  children: ReactNode;
  initialSession?: ActiveSessionState;
  initialViewport?: ShellViewport;
};

export function MobileShell({
  children,
  initialSession = DEFAULT_ACTIVE_SESSION,
  initialViewport = "phone",
}: MobileShellProps) {
  return (
    <ActiveSessionProvider initialSession={initialSession} initialViewport={initialViewport}>
      <AppChrome>{children}</AppChrome>
    </ActiveSessionProvider>
  );
}
