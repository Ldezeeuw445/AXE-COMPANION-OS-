"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { tabFromPathname, type ActiveSessionState } from "@/lib/session/activeSession";
import {
  persistActiveSession,
  prepareActiveSession,
  patchActiveSession,
} from "@/lib/session/activeSessionStore";
import {
  prepareShellViewport,
  syncShellViewportFromWindow,
  type ShellViewport,
} from "@/lib/viewport/shellViewport";

type Props = {
  initialSession: ActiveSessionState;
  initialViewport: ShellViewport;
  children: ReactNode;
};

/**
 * One hydration path for the mobile shell: server-known session + viewport
 * snapshots, then a single persist. Pathname updates last-tab without a
 * second fetch.
 */
export function ActiveSessionProvider({ initialSession, initialViewport, children }: Props) {
  useState(() => {
    prepareActiveSession(initialSession);
    prepareShellViewport(initialViewport);
    return true;
  });

  const pathname = usePathname();

  useLayoutEffect(() => {
    persistActiveSession();
    const tab = tabFromPathname(pathname);
    if (tab) patchActiveSession({ lastTab: tab });
  }, [pathname]);

  useEffect(() => {
    syncShellViewportFromWindow();
    const onChange = () => {
      syncShellViewportFromWindow();
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return children;
}
