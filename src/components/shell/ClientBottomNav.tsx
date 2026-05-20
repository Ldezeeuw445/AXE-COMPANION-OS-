"use client";

import dynamic from "next/dynamic";

const BottomNavNoSSR = dynamic(
  () => import("@/components/shell/BottomNav").then((m) => m.BottomNav),
  {
    ssr: false,
    loading: () => <div className="h-[var(--tos-nav-h)] shrink-0" aria-hidden />,
  }
);

export function ClientBottomNav() {
  return <BottomNavNoSSR />;
}
