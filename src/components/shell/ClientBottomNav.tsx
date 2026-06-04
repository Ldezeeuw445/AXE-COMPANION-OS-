"use client";

import dynamic from "next/dynamic";

const BottomNavNoSSR = dynamic(
  () => import("@/components/shell/BottomNav").then((m) => m.BottomNav),
  {
    ssr: false,
    loading: () => (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          height: "var(--tos-nav-h)",
          background: "linear-gradient(180deg, #101016, #0a0a0e)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-hidden
      />
    ),
  }
);

export function ClientBottomNav() {
  return <BottomNavNoSSR />;
}
