"use client";

import { useEffect } from "react";

export function ServiceWorkerInit() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[SW] registered", reg.scope);
        })
        .catch((err) => {
          console.warn("[SW] registration failed", err);
        });
    }
  }, []);

  return null;
}
