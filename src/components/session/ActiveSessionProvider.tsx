"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { sessionPatchFromDeepLink } from "@/lib/push/deepLinks";
import { SW_PUSH_OPEN_MESSAGE } from "@/lib/push/swClickRouting";
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
    if (typeof window !== "undefined") {
      const fromLink = sessionPatchFromDeepLink(`${window.location.pathname}${window.location.search}`);
      if (Object.keys(fromLink).length > 0) patchActiveSession(fromLink);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== SW_PUSH_OPEN_MESSAGE) return;
      if (data.session && typeof data.session === "object") {
        patchActiveSession(data.session);
      }
      const url = typeof data.url === "string" ? data.url : "";
      if (!url) return;
      const here = `${window.location.pathname}${window.location.search}`;
      if (here !== url) {
        window.location.assign(url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

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
