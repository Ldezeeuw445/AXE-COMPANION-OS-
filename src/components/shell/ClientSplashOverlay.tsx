"use client";

import dynamic from "next/dynamic";

const SplashOverlayNoSSR = dynamic(
  () =>
    import("@/components/shell/SplashOverlay").then((m) => m.SplashOverlay),
  { ssr: false }
);

export function ClientSplashOverlay() {
  return <SplashOverlayNoSSR />;
}
