"use client";

import dynamic from "next/dynamic";

const BottomNavNoSSR = dynamic(
  () => import("@/components/shell/BottomNav").then((m) => m.BottomNav),
  {
    ssr: false,
    loading: () => null,
  }
);

export function ClientBottomNav() {
  return <BottomNavNoSSR />;
}
