"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker. We swallow registration errors silently
 * in production — every browser has at least one quirk that can fail
 * registration (incognito, ad blockers, file:// previews) and a console
 * stack trace there serves no user value. In development we still surface
 * failures so a broken worker doesn't go unnoticed.
 */
export function ServiceWorkerInit() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[SW] registration failed", err);
      }
    });
  }, []);

  return null;
}
