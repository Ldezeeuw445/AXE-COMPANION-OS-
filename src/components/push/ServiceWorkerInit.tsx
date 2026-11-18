"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ServiceWorkerUpdateBanner } from "@/components/pwa/ServiceWorkerUpdateBanner";
import {
  clientBuildCommit,
  fetchServerBuildCommit,
  isDifferentBuild,
  isStaleBuildError,
  reloadForNewBuild,
} from "@/lib/pwa/staleBuild";
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

  // A deploy does not change sw.js, so the worker handshake above never fires
  // for it. A phone that resumes the PWA hours later still runs the old bundle:
  // its chunks and Server Actions are gone from the server (18 Nov: a red
  // account card and "Something went wrong" while MT5 was fine). Compare the
  // commit this bundle was built from with the one the server runs: on resume
  // reload straight away (nothing typed yet); while in use, show the banner.
  useEffect(() => {
    const build = clientBuildCommit();
    if (!build) return;
    let alive = true;
    const check = async (resumed: boolean) => {
      const serving = await fetchServerBuildCommit();
      if (!alive || !isDifferentBuild(build, serving)) return;
      if (resumed && reloadForNewBuild()) return;
      setUpdateWaiting(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    const onError = (event: ErrorEvent) => {
      if (isStaleBuildError(event.message || event.error)) reloadForNewBuild();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleBuildError(event.reason)) reloadForNewBuild();
    };
    void check(false);
    const id = window.setInterval(() => void check(false), 5 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
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
    <ServiceWorkerUpdateBanner
      className="fixed inset-x-0 top-0 z-[1000]"
      onReload={() => void reloadWithUpdate()}
    />
  );
}
