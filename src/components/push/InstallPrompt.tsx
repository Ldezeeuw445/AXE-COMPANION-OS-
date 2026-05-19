"use client";

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Install AXE as a standalone PWA.
 *
 * Renders nothing on iOS (Apple ignores `beforeinstallprompt`; the user has
 * to use the share-sheet → Add to Home Screen flow, which `PushPermission`
 * already documents). Renders nothing once the app is already installed
 * (display-mode: standalone) — no point nagging.
 *
 * On Chrome / Edge / Samsung Internet, captures the deferred prompt and
 * shows a single button. The installed app is independent — no Trading OS
 * required, no token configuration, no shared workspace — it just becomes
 * a homescreen launcher with its own task switcher entry.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // Defer the standalone check off the render path so React's
    // set-state-in-effect rule stays clean and we still catch the
    // post-install state correctly.
    const probe = () => {
      const isStandalone =
        (typeof window.matchMedia === "function" &&
          window.matchMedia("(display-mode: standalone)").matches) ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!cancelled && isStandalone) setInstalled(true);
    };
    queueMicrotask(probe);

    const handler = (e: Event) => {
      e.preventDefault();
      if (!cancelled) setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => {
      if (!cancelled) {
        setInstalled(true);
        setDeferredPrompt(null);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const onClick = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  if (installed) {
    return (
      <p className="text-[11px] text-emerald-300/85">
        Installed as an app — open from your home screen for full lock-screen notifications.
      </p>
    );
  }
  if (!deferredPrompt) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-white/90 transition-colors hover:bg-white/[0.08]"
    >
      Install AXE on this device
    </button>
  );
}
