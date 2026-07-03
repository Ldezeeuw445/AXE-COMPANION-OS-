"use client";

import { useEffect, useState } from "react";
import {
  isTabletLandscape,
  isTabletViewport,
  lockTabletLandscape,
  unlockTabletLandscape,
} from "@/lib/viewport/tablet";

function isEmbedTabletMock(): boolean {
  if (typeof document === "undefined") return false;
  if (document.body.classList.contains("axe-embed-tablet")) return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const device = params.get("embedDevice") ?? params.get("device");
  return params.get("embed") === "1" && device === "tablet";
}

/**
 * Touch tablets (iPad) run landscape-only: lock orientation and block
 * portrait with a rotate prompt so the shell layout stays stable.
 */
export function TabletShellEffects() {
  const [portraitBlock, setPortraitBlock] = useState(false);

  useEffect(() => {
    function sync() {
      const embedTablet = isEmbedTabletMock();
      const tablet = embedTablet || isTabletViewport();
      const landscape = embedTablet || isTabletLandscape();
      document.body.classList.toggle("tos-tablet-device", tablet);
      document.body.classList.toggle("tos-tablet-landscape", tablet && landscape);
      document.body.classList.toggle("tos-tablet-portrait", tablet && !landscape);
      setPortraitBlock(tablet && !landscape);
      if (tablet && landscape) lockTabletLandscape();
    }

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", sync);

    if (isTabletViewport() || isEmbedTabletMock()) lockTabletLandscape();

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      if (!isEmbedTabletMock()) {
        document.body.classList.remove("tos-tablet-device", "tos-tablet-landscape", "tos-tablet-portrait");
      }
      unlockTabletLandscape();
    };
  }, []);

  if (!portraitBlock) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-4 bg-[#060608] px-8 text-center"
      role="dialog"
      aria-modal="true"
      aria-label="Rotate your tablet"
    >
      <div
        className="flex h-20 w-28 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04]"
        aria-hidden
      >
        <svg viewBox="0 0 48 48" className="h-12 w-12 text-cyan-400/90" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="10" y="6" width="20" height="36" rx="3" />
          <path d="M34 18l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="30" y="14" width="14" height="20" rx="2" transform="rotate(90 37 24)" />
        </svg>
      </div>
      <div>
        <p className="text-lg font-semibold text-white">Draai je tablet naar landscape</p>
        <p className="mt-2 max-w-sm text-sm text-white/55">
          AXE Companion op tablet werkt alleen in landscape-modus, net als MT5 op een trading tablet.
        </p>
      </div>
    </div>
  );
}
