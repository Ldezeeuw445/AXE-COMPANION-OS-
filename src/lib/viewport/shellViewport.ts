"use client";

import { useSyncExternalStore } from "react";
import { isMouseDesktopLayout, isTabletViewport } from "@/lib/viewport/tablet";
import {
  formatViewportCookie,
  type ShellViewport,
} from "@/lib/viewport/shellViewportServer";

export {
  VIEWPORT_COOKIE,
  formatViewportCookie,
  parseShellViewport,
  type ShellViewport,
} from "@/lib/viewport/shellViewportServer";

const listeners = new Set<() => void>();

/** Phone-first: SSR and first client render share this unless a cookie says otherwise. */
let serverViewport: ShellViewport = "phone";
let currentViewport: ShellViewport = "phone";
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

export function detectShellViewport(): ShellViewport {
  if (typeof window === "undefined") return serverViewport;
  if (isMouseDesktopLayout()) return "desktop";
  if (isTabletViewport()) return "tablet";
  return "phone";
}

function persistViewport(next: ShellViewport) {
  if (typeof document === "undefined") return;
  try {
    document.cookie = formatViewportCookie(next);
  } catch {
    /* ignore */
  }
}

export function prepareShellViewport(snapshot: ShellViewport): ShellViewport {
  serverViewport = snapshot;
  if (!hydrated) {
    currentViewport = snapshot;
    hydrated = true;
  }
  return currentViewport;
}

export function hydrateShellViewport(snapshot: ShellViewport): ShellViewport {
  prepareShellViewport(snapshot);
  persistViewport(currentViewport);
  emit();
  return currentViewport;
}

export function syncShellViewportFromWindow(): ShellViewport {
  const detected = detectShellViewport();
  if (!hydrated) {
    serverViewport = currentViewport;
    hydrated = true;
  }
  if (detected === currentViewport) return currentViewport;
  currentViewport = detected;
  persistViewport(detected);
  emit();
  return currentViewport;
}

export function getShellViewport(): ShellViewport {
  return currentViewport;
}

export function getShellViewportServerSnapshot(): ShellViewport {
  return serverViewport;
}

export function subscribeShellViewport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useShellViewport(): ShellViewport {
  return useSyncExternalStore(
    subscribeShellViewport,
    getShellViewport,
    getShellViewportServerSnapshot,
  );
}

export function resetShellViewportForTests(next: ShellViewport = "phone"): void {
  serverViewport = next;
  currentViewport = next;
  hydrated = false;
  listeners.clear();
}
