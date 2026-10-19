"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  SW_CACHE_LAST_VIEWED_MESSAGE,
  SW_SKIP_WAITING_MESSAGE,
  isSafeNavigation,
} from "@/lib/pwa/cachePolicy";

/**
 * Registers the PWA service worker, prompts when a new version is waiting
 * (so a deploy cannot leave the tab on stale JS bundles), and tells the
 * worker which last-viewed app route to keep for offline.
 */
export function ServiceWorkerInit() {
  const pathname = usePathname();
  const [updateWaiting, setUpdateWaiting] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    const onUpdateFound = () => {
      const incoming = registration?.installing;
      if (!incoming) return;
      incoming.addEventListener("statechange", () => {
        if (incoming.state === "installed" && navigator.serviceWorker.controller) {
          if (!cancelled) setUpdateWaiting(true);
        }
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) {
          setUpdateWaiting(true);
        }
        reg.addEventListener("updatefound", onUpdateFound);
        void reg.update();
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[SW] registration failed", err);
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void registration?.update();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !pathname) return;
    if (!isSafeNavigation(pathname)) return;
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    controller.postMessage({ type: SW_CACHE_LAST_VIEWED_MESSAGE, url: pathname });
  }, [pathname]);

  const reloadWithUpdate = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      window.location.reload();
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const waiting = reg?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    const reload = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    waiting.postMessage({ type: SW_SKIP_WAITING_MESSAGE });
    window.setTimeout(reload, 1500);
  }, []);

  if (!updateWaiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[1000] flex items-center justify-center gap-3 bg-[#101013]/95 px-4 py-2 text-[12px] text-[#ededef] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <span>A new AXE version is ready. Reload to drop the stale bundle.</span>
      <button
        type="button"
        onClick={() => void reloadWithUpdate()}
        className="rounded border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase"
      >
        Reload
      </button>
    </div>
  );
}
